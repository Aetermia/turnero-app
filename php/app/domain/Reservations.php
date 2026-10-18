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
