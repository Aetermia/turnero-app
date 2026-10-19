<?php

declare(strict_types=1);

/*
 * Panel: client list and CSV export (port of src/lib/clients.ts).
 *
 *  - Health data is never selected here (Ley 25.326).
 *  - Marketing consent decides whether the email is shown at all: a client
 *    who did not tick "Quiero recibir novedades..." keeps showing up (name,
 *    WhatsApp, reservations) but the email reads "sin consentimiento" in the
 *    page and the CSV, and the copy button skips it.
 *  - "Activas" uses the same seat-holding rule as the rest of the system,
 *    through the effective status: an unpaid hold past its 30 minutes stops
 *    counting with no cron.
 */
final class Clients
{
    public const NO_CONSENT = 'sin consentimiento';
    private const CSV_HEADER = ['Nombre', 'Email', 'WhatsApp', 'Reservas totales', 'Reservas activas', 'Última reserva'];

    /**
     * One row per customer with at least one reservation, newest activity first.
     *
     * @return list<array{id: string, full_name: string, email: string, whatsapp: string, marketing_consent: bool,
     *                    total_reservations: int, active_reservations: int, last_reservation_at: ?string}>
     */
    public static function list(?string $search): array
    {
        $where = '';
        $params = [];
        if ($search !== null && $search !== '') {
            // A typed % or _ must match literally, never as a wildcard. "!" is
            // the escape character: unlike a backslash it means the same with
            // or without NO_BACKSLASH_ESCAPES in the server's sql_mode.
            $pattern = '%' . strtr($search, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
            $where = "WHERE c.full_name LIKE ? ESCAPE '!' OR c.email LIKE ? ESCAPE '!' OR c.whatsapp LIKE ? ESCAPE '!'";
            $params = [$pattern, $pattern, $pattern];
        }
        $rows = Db::all(
            "SELECT c.id, c.full_name, c.email, c.whatsapp, c.marketing_consent,
                    COUNT(*) AS total_reservations,
                    SUM(CASE WHEN " . Reservations::EFFECTIVE_STATUS . " IN ('pending_no_receipt', 'pending_review', 'approved') THEN 1 ELSE 0 END) AS active_reservations,
                    MAX(r.created_at) AS last_reservation_at
               FROM customers c
               JOIN reservations r ON r.customer_id = c.id
               {$where}
              GROUP BY c.id, c.full_name, c.email, c.whatsapp, c.marketing_consent
              ORDER BY MAX(r.created_at) DESC, c.id",
            $params
        );
        return array_map(static fn (array $row): array => [
            'id' => $row['id'],
            'full_name' => $row['full_name'],
            'email' => $row['email'],
            'whatsapp' => $row['whatsapp'],
            'marketing_consent' => (bool) $row['marketing_consent'],
            'total_reservations' => (int) $row['total_reservations'],
            'active_reservations' => (int) $row['active_reservations'],
            'last_reservation_at' => $row['last_reservation_at'],
        ], $rows);
    }

    /** The email the panel may show: the real one only with marketing consent. */
    public static function visibleEmail(array $client): string
    {
        return $client['marketing_consent'] ? $client['email'] : self::NO_CONSENT;
    }

    /**
     * UTF-8 with a BOM (so Excel opens the accents right), CRLF rows, a
     * trailing CRLF and every field quoted with inner quotes doubled.
     *
     * @param list<array<string, mixed>> $rows
     */
    public static function toCsv(array $rows): string
    {
        $lines = [implode(',', array_map(self::csvField(...), self::CSV_HEADER))];
        foreach ($rows as $row) {
            $lines[] = implode(',', array_map(self::csvField(...), [
                (string) $row['full_name'],
                self::visibleEmail($row),
                (string) $row['whatsapp'],
                (string) $row['total_reservations'],
                (string) $row['active_reservations'],
                $row['last_reservation_at'] !== null ? Format::dateTime((string) $row['last_reservation_at']) : '',
            ]));
        }
        return "\u{FEFF}" . implode("\r\n", $lines) . "\r\n";
    }

    private static function csvField(string $value): string
    {
        return '"' . str_replace('"', '""', $value) . '"';
    }
}
