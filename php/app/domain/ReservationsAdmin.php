<?php

declare(strict_types=1);

/*
 * Panel: reservations (port of the admin half of src/lib/reservations.ts).
 *
 *  - The list never selects the health columns (Ley 25.326): only the detail
 *    page, behind the admin session, reads them.
 *  - Filtering by status uses the EFFECTIVE status, so an unpaid hold whose
 *    30 minutes are over shows (and filters) as "Expirada" with no cron.
 *  - Approve and reject are one conditional UPDATE each: only a row still in
 *    pending_review changes. A double click or two open tabs change it once;
 *    the second call returns false.
 *  - Rejecting frees the seat by itself: SEAT_HOLDING stops counting the row
 *    and the generated active_customer_id becomes NULL, so the same person can
 *    book again. Approving keeps the seat taken, so the counts do not move.
 */
final class ReservationsAdmin
{
    public const STATUSES = ['pending_no_receipt', 'pending_review', 'approved', 'rejected', 'expired', 'cancelled'];

    /**
     * @param array{eventId?: string|null, status?: string|null} $filters already validated
     * @return list<array<string, mixed>>
     */
    public static function list(array $filters): array
    {
        $where = [];
        $params = [];
        if (($filters['eventId'] ?? null) !== null) {
            $where[] = 'r.event_id = ?';
            $params[] = $filters['eventId'];
        }
        if (($filters['status'] ?? null) !== null) {
            $where[] = Reservations::EFFECTIVE_STATUS . ' = ?';
            $params[] = $filters['status'];
        }
        $rows = Db::all(
            'SELECT r.id, r.status, ' . Reservations::EFFECTIVE_STATUS . ' AS effective_status, r.created_at,
                    r.event_id, e.title AS event_title, e.starts_at AS event_starts_at,
                    c.full_name AS customer_full_name, c.email AS customer_email, c.whatsapp AS customer_whatsapp,
                    r.receipt_path IS NOT NULL AS has_receipt
               FROM reservations r
               JOIN events e ON e.id = r.event_id
               JOIN customers c ON c.id = r.customer_id'
            . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
            . ' ORDER BY r.created_at DESC, r.id',
            $params
        );
        foreach ($rows as &$row) {
            $row['has_receipt'] = (bool) $row['has_receipt'];
        }
        return $rows;
    }

    /** Full detail for the panel, health data included; null for an unknown or malformed id. */
    public static function find(string $id): ?array
    {
        if (!is_uuid($id)) {
            return null;
        }
        $row = Db::one(
            'SELECT r.id, r.status, ' . Reservations::EFFECTIVE_STATUS . ' AS effective_status,
                    r.expires_at, r.created_at, r.resolved_at, r.rejection_reason,
                    r.transfer_holder, r.transfer_amount, r.transfer_date, r.transfer_reference,
                    r.receipt_path, r.receipt_mime_type, r.receipt_uploaded_at,
                    r.has_condition, r.condition_details,
                    c.full_name AS customer_full_name, c.email AS customer_email, c.whatsapp AS customer_whatsapp,
                    c.marketing_consent AS customer_marketing_consent, c.marketing_consent_at AS customer_marketing_consent_at,
                    e.id AS event_id, e.title AS event_title, e.theme AS event_theme, e.location AS event_location,
                    e.starts_at AS event_starts_at, e.ends_at AS event_ends_at, e.price AS event_price, e.capacity AS event_capacity
               FROM reservations r
               JOIN events e ON e.id = r.event_id
               JOIN customers c ON c.id = r.customer_id
              WHERE r.id = ?',
            [$id]
        );
        if ($row === null) {
            return null;
        }
        $row['has_condition'] = (bool) $row['has_condition'];
        $row['customer_marketing_consent'] = (bool) $row['customer_marketing_consent'];
        return $row;
    }

    public static function approve(string $id): bool
    {
        if (!is_uuid($id)) {
            return false;
        }
        return Db::run(
            "UPDATE reservations SET status = 'approved', resolved_at = NOW()
              WHERE id = ? AND status = 'pending_review'",
            [$id]
        ) === 1;
    }

    public static function reject(string $id, ?string $reason): bool
    {
        if (!is_uuid($id)) {
            return false;
        }
        return Db::run(
            "UPDATE reservations SET status = 'rejected', rejection_reason = ?, resolved_at = NOW()
              WHERE id = ? AND status = 'pending_review'",
            [$reason, $id]
        ) === 1;
    }
}
