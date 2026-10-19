<?php
/*
 * P10 — the 30-minute hold and the public status page (R3):
 *   - the expiry is decided by the database with NOW(): no cron, no PHP clock.
 *     A hold that crosses its deadline while nobody touches it reads as
 *     expired on the very next request, and stops taking a seat
 *   - an expired hold lets the same person book again (the old row is
 *     materialized to 'expired' inside the booking transaction) and lets
 *     somebody else take the seat
 *   - the page shows each of the 6 states with the original texts, and never
 *     the health condition, the email or the WhatsApp number (Ley 25.326)
 *   - bad tokens are a 404 that does not say whether the token exists
 *   - the panel filters the lapsed hold as "Expirada"
 *
 * Run: php tests/verify-status-page.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));
$base = start_test_server(write_test_config(['payment_alias' => 'alias.de.prueba']));

function book(string $eventId, string $email): array
{
    $result = Reservations::create($eventId, ['full_name' => 'Ana Prueba', 'email' => $email, 'whatsapp' => '2494 77-6655',
        'has_condition' => true, 'condition_details' => 'DATO-DE-SALUD-SECRETO', 'marketing_consent' => true]);
    if (!($result['ok'] ?? false)) {
        return $result;
    }
    $row = Db::one('SELECT id FROM reservations WHERE public_token = ?', [$result['token']]);
    return $result + ['id' => $row['id']];
}
$stored = static fn (string $id): string => (string) Db::one('SELECT status FROM reservations WHERE id = ?', [$id])['status'];
$page = static function (string $token) use ($base): array {
    [$code, $headers, $html] = http('GET', "{$base}/reservas/{$token}");
    return [$code, $html, $headers];
};
$private = static fn (string $html): bool => !str_contains($html, 'DATO-DE-SALUD-SECRETO') && !str_contains($html, '2494 77-6655')
    && !str_contains($html, '@example.com') && !str_contains($html, 'Ana Prueba');

echo "Expiry computed by NOW(), with nobody touching the row:\n";
$one = t_event($pdo, ['title' => 'Un solo lugar', 'capacity' => 1]);
$a = book($one, 'primera@example.com');
$expires = Db::one('SELECT TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS s FROM reservations WHERE id = ?', [$a['id']])['s'];
check(abs((int) $expires - 30 * 60) <= 2, "a new hold expires 30 minutes after NOW() ({$expires} s)");
check((book($one, 'segunda@example.com')['reason'] ?? '') === 'sold_out', 'while the hold is alive the 1-seat event is sold out');
Db::run('UPDATE reservations SET expires_at = NOW() + INTERVAL 2 SECOND WHERE id = ?', [$a['id']]);
[, $html] = $page($a['token']);
check(str_contains($html, 'Te guardamos el lugar') && str_contains($html, 'data-receipt-upload'), '2 seconds before the deadline: "Te guardamos el lugar" with the upload form');
sleep(3);
[, $html] = $page($a['token']);
check(str_contains($html, 'El plazo venció') && !str_contains($html, 'data-receipt-upload'), '3 seconds later, with no cron and no write: "El plazo venció", no upload form');
check($stored($a['id']) === 'pending_no_receipt', 'the stored status is still pending_no_receipt (the expiry is read, not written)');
check(EventsAdmin::find($one)['occupied'] === 0, 'and it no longer takes the seat (0 occupied)');
check(array_column(ReservationsAdmin::list(['eventId' => $one, 'status' => 'expired']), 'id') === [$a['id']], 'the panel filter "Expirada" lists it');
$b = book($one, 'segunda@example.com');
check(($b['ok'] ?? false) === true, 'somebody else can now take the seat');
check((book($one, 'tercera@example.com')['reason'] ?? '') === 'sold_out', 'and the event is full again (never more than 1)');

echo "\nRe-booking after an expired hold:\n";
$five = t_event($pdo, ['title' => 'Cinco lugares', 'capacity' => 5]);
$first = book($five, 'vuelve@example.com');
check((book($five, 'vuelve@example.com')['reason'] ?? '') === 'already_reserved', 'with a live hold the same email is rejected');
Db::run('UPDATE reservations SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [$first['id']]);
$second = book($five, 'vuelve@example.com');
check(($second['ok'] ?? false) === true && $second['token'] !== $first['token'], 'after expiry the same email books again, with a new token');
check($stored($first['id']) === 'expired', 'the old row was materialized to "expired" in that same transaction');
check(EventsAdmin::find($five)['occupied'] === 1, 'only the new hold takes a seat (1 occupied)');
[, $html] = $page($first['token']);
check(str_contains($html, 'El plazo venció') && str_contains($html, 'Ver el evento y reservar de nuevo') && str_contains($html, "/eventos/{$five}"), 'the old link still works and offers "Ver el evento y reservar de nuevo"');

echo "\nThe 6 states, never with personal or health data:\n";
$ev = t_event($pdo, ['title' => 'Estados', 'capacity' => 10, 'price' => '15000.00']);
$cases = [
    'pending_no_receipt' => ['Te guardamos el lugar', 'Transferí el total por Mercado Pago a este alias:', 'alias.de.prueba', 'Completar pago'],
    'pending_review' => ['Tu reserva está en revisión', 'Ya recibimos tu comprobante', 'Datos enviados', 'Titular Prueba'],
    'approved' => ['Tu reserva está confirmada', '¡Te esperamos!'],
    'rejected' => ['No pudimos confirmar tu pago', 'Motivo: El monto no coincide.', 'escribinos por WhatsApp'],
    'expired' => ['El plazo venció', 'podés reservar de nuevo', 'Ver el evento y reservar de nuevo'],
    'cancelled' => ['La reserva fue cancelada'],
];
$i = 0;
foreach ($cases as $state => $texts) {
    $r = book($ev, "estado{$i}@example.com");
    $i++;
    $set = match ($state) {
        'pending_no_receipt' => null,
        'pending_review' => "status = 'pending_review', expires_at = NULL, transfer_holder = 'Titular Prueba', transfer_amount = 15000, transfer_date = '2026-10-18', transfer_reference = 'OP-9'",
        'rejected' => "status = 'rejected', expires_at = NULL, rejection_reason = 'El monto no coincide'",
        'expired' => 'expires_at = NOW() - INTERVAL 1 SECOND',
        default => "status = '{$state}', expires_at = NULL",
    };
    if ($set !== null) {
        Db::run("UPDATE reservations SET {$set} WHERE id = ?", [$r['id']]);
    }
    [$code, $html] = $page($r['token']);
    $missing = array_filter($texts, static fn (string $t): bool => !str_contains($html, $t));
    $common = str_contains($html, 'Estados') && str_contains($html, "\$\u{00A0}15.000,00");
    $forms = str_contains($html, 'data-receipt-upload');
    check($code === 200 && $missing === [] && $common && $forms === ($state === 'pending_no_receipt'),
        "{$state}: " . (string) Format::reservationStatus($state) . ' — original texts' . ($missing ? ' MISSING: ' . implode(' | ', $missing) : '') . ', event and total, payment form only while held');
    check($private($html), "{$state}: no health condition, name, email or WhatsApp in the page");
}

echo "\nTokens:\n";
foreach (['no-es-un-token', str_repeat('a', 43), str_repeat('A', 42) . '!', "' OR 1=1 -- "] as $bad) {
    [$code, $html] = $page(rawurlencode($bad));
    check($code === 404 && str_contains($html, 'noindex') && !str_contains($html, 'El plazo') && !str_contains($html, 'Te guardamos'), 'token ' . json_encode($bad) . ' -> 404 noindex, no reservation data');
}
[$code, $html, $headers] = $page($second['token']);
check(str_contains($html, '<meta name="robots" content="noindex') && ($headers['referrer-policy'][0] ?? '') === 'strict-origin-when-cross-origin', 'the status page is noindex and the token does not leak through the Referer header');
check(strlen($second['token']) === 43 && Reservations::isWellFormedToken($second['token']), 'tokens are 43 characters (32 random bytes, base64url)');

finish();
