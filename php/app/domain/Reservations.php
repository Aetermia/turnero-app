<?php

declare(strict_types=1);

/*
 * Reservations: creation with the seat held atomically (R1), and the single
 * SQL encoding of the hold timer (R3).
 *
 * Seat counting and the insert happen inside ONE InnoDB transaction that first
 * locks the event row (SELECT ... FOR UPDATE). Without that lock two concurrent
 * requests read the same free seat and both insert, selling the last seat
 * twice. With it, the second request waits and then sees the seat taken.
 */
final class Reservations
{
    /** How long a pending_no_receipt reservation holds its seat. */
    public const HOLD_MINUTES = 30;

    /**
     * The status a reservation shows NOW, with the hold timer evaluated by the
     * database clock: a pending_no_receipt whose deadline passed reads as
     * 'expired' even though the stored status never changed. Exact mirror of
     * Events::SEAT_HOLDING, and the only place this rule is written. Use it
     * with the reservations table aliased as "r".
     */
    public const EFFECTIVE_STATUS = "(CASE
        WHEN r.status = 'pending_no_receipt' AND (r.expires_at IS NULL OR r.expires_at <= NOW())
        THEN 'expired' ELSE r.status END)";

    private const MYSQL_DUPLICATE_KEY = 1062;
    private const MYSQL_DEADLOCK = 1213;
    private const MYSQL_LOCK_WAIT_TIMEOUT = 1205;

    /**
     * @param array{full_name: string, email: string, whatsapp: string, has_condition: bool,
     *              condition_details: ?string, marketing_consent: bool} $input already validated
     * @return array{ok: true, token: string}|array{ok: false, reason: 'not_found'|'sold_out'|'already_reserved'}
     */
    public static function create(string $eventId, array $input): array
    {
        // A deadlock or a lock timeout is InnoDB asking to retry, not a real
        // failure (it can happen when the same email books two events at once).
        for ($attempt = 1; ; $attempt++) {
            try {
                return self::createOnce($eventId, $input);
            } catch (PDOException $error) {
                $code = (int) ($error->errorInfo[1] ?? 0);
                if ($code === self::MYSQL_DUPLICATE_KEY) {
                    // The unique (event_id, active_customer_id) index rejected
                    // a second active reservation for this person: that is a
                    // duplicate, never a server error.
                    return ['ok' => false, 'reason' => 'already_reserved'];
                }
                if (in_array($code, [self::MYSQL_DEADLOCK, self::MYSQL_LOCK_WAIT_TIMEOUT], true) && $attempt < 3) {
                    usleep(random_int(20_000, 80_000));
                    continue;
                }
                throw $error;
            }
        }
    }

    /** @return array{ok: bool, token?: string, reason?: string} */
    private static function createOnce(string $eventId, array $input): array
    {
        return Db::transaction(static function (PDO $pdo) use ($eventId, $input): array {
            // 1. Serialize every attempt on this event. A second request blocks
            //    here until the first commits, so it cannot see the same seat.
            $lock = $pdo->prepare('SELECT id, capacity, is_published, starts_at > NOW() AS upcoming
                                   FROM events WHERE id = ? FOR UPDATE');
            $lock->execute([$eventId]);
            $event = $lock->fetch();

            // 2. The event must exist, be published and not have started.
            if ($event === false || (int) $event['is_published'] !== 1 || (int) $event['upcoming'] !== 1) {
                return ['ok' => false, 'reason' => 'not_found'];
            }

            // 3. Count occupied seats with the timer evaluated by the database
            //    clock. Never a static list of statuses: it cannot express the
            //    timer, so an abandoned hold would shrink capacity forever.
            $count = $pdo->prepare('SELECT COUNT(*) FROM reservations r WHERE r.event_id = ? AND ' . Events::SEAT_HOLDING);
            $count->execute([$eventId]);
            if ((int) $count->fetchColumn() >= (int) $event['capacity']) {
                return ['ok' => false, 'reason' => 'sold_out'];
            }

            // 4. Upsert the customer by email. The email is unique, and that is
            //    what makes "one active reservation per person" enforceable.
            $pdo->prepare('INSERT INTO customers (id, full_name, email, whatsapp, marketing_consent, marketing_consent_at)
                           VALUES (?, ?, ?, ?, ?, IF(?, NOW(), NULL))
                           ON DUPLICATE KEY UPDATE
                             full_name = VALUES(full_name),
                             whatsapp = VALUES(whatsapp),
                             marketing_consent = VALUES(marketing_consent),
                             marketing_consent_at = VALUES(marketing_consent_at)')
                ->execute([
                    uuid_v4(),
                    $input['full_name'],
                    $input['email'],
                    $input['whatsapp'],
                    $input['marketing_consent'] ? 1 : 0,
                    $input['marketing_consent'] ? 1 : 0,
                ]);
            $customer = $pdo->prepare('SELECT id FROM customers WHERE email = ?');
            $customer->execute([$input['email']]);
            $customerId = (string) $customer->fetchColumn();

            // 5. Materialize an expired hold of this same person for this event
            //    BEFORE the insert. The unique index looks at the STORED status,
            //    so a hold whose timer ran out would still block this person
            //    forever even though its seat is already free. The condition is
            //    the exact complement of the seat predicate, by the DB clock.
            //    Race-free (step 1 holds the event lock), idempotent, and it
            //    changes no seat count: that row had already stopped counting.
            $pdo->prepare("UPDATE reservations SET status = 'expired'
                           WHERE event_id = ? AND customer_id = ? AND status = 'pending_no_receipt'
                             AND (expires_at IS NULL OR expires_at <= NOW())")
                ->execute([$eventId, $customerId]);

            // 6. Insert the reservation holding the seat for 30 minutes, with
            //    the database clock. No terms acceptance is recorded: the form
            //    has no terms checkbox (decision D2).
            $token = self::newToken();
            $pdo->prepare('INSERT INTO reservations
                             (id, event_id, customer_id, status, public_token, expires_at, has_condition, condition_details)
                           VALUES (?, ?, ?, \'pending_no_receipt\', ?, NOW() + INTERVAL ' . self::HOLD_MINUTES . ' MINUTE, ?, ?)')
                ->execute([
                    uuid_v4(),
                    $eventId,
                    $customerId,
                    $token,
                    $input['has_condition'] ? 1 : 0,
                    $input['condition_details'],
                ]);

            return ['ok' => true, 'token' => $token];
        });
    }

    /**
     * Everything the public, token-only page shows, and nothing else. The
     * declared health condition is deliberately NOT selected: it is sensitive
     * data (Ley 25.326) and this page needs no login, only the token.
     *
     * @return array<string, mixed>|null
     */
    public static function byToken(string $token): ?array
    {
        if (!self::isWellFormedToken($token)) {
            return null;
        }
        return Db::one(
            'SELECT r.id, r.public_token, r.status, ' . self::EFFECTIVE_STATUS . ' AS effective_status,
                    r.expires_at, r.created_at, r.event_id, e.title AS event_title,
                    e.starts_at AS event_starts_at, e.price AS event_price,
                    r.transfer_holder, r.transfer_amount, r.transfer_date, r.transfer_reference,
                    r.rejection_reason, r.receipt_path IS NOT NULL AS has_receipt, r.receipt_mime_type
             FROM reservations r JOIN events e ON e.id = r.event_id
             WHERE r.public_token = ?',
            [$token],
        );
    }

    /**
     * Stores the receipt of a live hold. The file goes to private storage and
     * its path is written to the database right away, so the confirmation
     * step never trusts a path sent by the browser. While the hold is still
     * pending the person may replace it (e.g. after picking the wrong file);
     * the previous file is deleted.
     *
     * @param array<string, mixed> $file a $_FILES entry that passed Receipts::validate()
     * @return array{ok: true}|array{ok: false, error: string}
     */
    public static function attachReceipt(string $token, array $file): array
    {
        $reservation = self::byToken($token);
        if ($reservation === null) {
            return ['ok' => false, 'error' => 'Reserva no encontrada'];
        }
        if ($reservation['effective_status'] === 'expired') {
            return ['ok' => false, 'error' => 'La reserva ya expiró. No es posible completar el pago'];
        }
        if ($reservation['effective_status'] !== 'pending_no_receipt') {
            // Same wording as the original once the payment was confirmed.
            return ['ok' => false, 'error' => $reservation['has_receipt']
                ? 'Ya se subió el comprobante para esta reserva'
                : 'No es posible subir el comprobante en el estado actual'];
        }

        [$path, $type] = Receipts::store($reservation['id'], $file);
        $previous = Db::one('SELECT receipt_path FROM reservations WHERE id = ?', [$reservation['id']])['receipt_path'] ?? null;
        // Conditional on the hold still being live by the database clock, so
        // a receipt is never attached to a hold that expired meanwhile.
        $updated = Db::run(
            "UPDATE reservations
             SET receipt_path = ?, receipt_mime_type = ?, receipt_uploaded_at = NOW()
             WHERE id = ? AND status = 'pending_no_receipt' AND expires_at > NOW()",
            [$path, $type, $reservation['id']],
        );
        if ($updated === 0) {
            Receipts::delete($path);
            return ['ok' => false, 'error' => 'La reserva ya expiró. No es posible completar el pago'];
        }
        if ($previous !== null && $previous !== $path) {
            Receipts::delete($previous);
        }
        return ['ok' => true];
    }

    /**
     * Step 2 of the payment: the declared transfer data. Moves the hold to
     * pending_review and clears its deadline: from here on only the owner can
     * release the seat. A single conditional UPDATE, so a hold that expires
     * at the same instant can never be confirmed.
     *
     * @param array{transfer_holder: string, transfer_amount: string, transfer_date: string, transfer_reference: string} $data
     * @return array{ok: true}|array{ok: false, error: string}
     */
    public static function confirmPayment(string $token, array $data): array
    {
        $reservation = self::byToken($token);
        if ($reservation === null) {
            return ['ok' => false, 'error' => 'Reserva no encontrada'];
        }
        if ($reservation['effective_status'] === 'expired') {
            return ['ok' => false, 'error' => 'La reserva ya expiró. No es posible completar el pago'];
        }
        if ($reservation['effective_status'] !== 'pending_no_receipt') {
            return ['ok' => false, 'error' => 'No es posible completar la reserva en el estado actual'];
        }
        if (!(bool) $reservation['has_receipt']) {
            return ['ok' => false, 'error' => 'Falta el comprobante subido'];
        }
        if (self::cents($data['transfer_amount']) !== self::cents((string) $reservation['event_price'])) {
            return ['ok' => false, 'error' => sprintf(
                'El monto declarado ($%s) no coincide con el total del evento ($%s). Verificá el monto transferido.',
                self::plainAmount($data['transfer_amount']),
                self::plainAmount((string) $reservation['event_price']),
            )];
        }

        $updated = Db::run(
            "UPDATE reservations
             SET status = 'pending_review', expires_at = NULL,
                 transfer_holder = ?, transfer_amount = ?, transfer_date = ?, transfer_reference = ?
             WHERE id = ? AND status = 'pending_no_receipt' AND expires_at > NOW() AND receipt_path IS NOT NULL",
            [$data['transfer_holder'], $data['transfer_amount'], $data['transfer_date'], $data['transfer_reference'], $reservation['id']],
        );
        if ($updated === 0) {
            return ['ok' => false, 'error' => 'La reserva ya expiró. No es posible completar el pago'];
        }
        return ['ok' => true];
    }

    /** "15000" / "15000.5" / "15000.50" => 1500000. Integer cents, never a float. */
    private static function cents(string $amount): int
    {
        [$whole, $fraction] = array_pad(explode('.', $amount, 2), 2, '');
        return (int) $whole * 100 + (int) str_pad(substr($fraction, 0, 2), 2, '0');
    }

    /** Same text as JavaScript's Number(x).toFixed(2): "15000.00". */
    private static function plainAmount(string $amount): string
    {
        $cents = self::cents($amount);
        return intdiv($cents, 100) . '.' . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    /** 32 random bytes, base64url without padding (same as the Next.js version). */
    public static function newToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    public static function isWellFormedToken(string $token): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_-]{20,64}$/', $token);
    }
}
