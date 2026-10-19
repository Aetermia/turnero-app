<?php
/*
 * P5 — booking under real concurrency (R1), plus the booking form over HTTP.
 * Equivalent to scripts/verify-concurrency.mjs in the Next.js version: the
 * assertions are fixed here, the workers call the REAL Reservations::create,
 * each in its own process with its own connection, all released at the same
 * instant against a real MariaDB.
 *
 *   - event with 1 seat, 8 simultaneous attempts (distinct emails) => exactly
 *     1 accepted, 7 sold_out — repeated over several rounds
 *   - event with 5 seats, the SAME email twice in parallel => 1 ok + 1
 *     already_reserved
 *   - an expired hold does not block re-booking; a live one does
 *   - HTTP: CSRF, validation messages, redirect to the secret link, 404s
 *
 * Run: php tests/verify-concurrency.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));

/**
 * Launches one worker per email, all released at the same instant.
 *
 * @param list<string> $emails
 * @return list<array<string, mixed>>
 */
function parallel_bookings(string $eventId, array $emails): array
{
    $startAt = microtime(true) + 1.5; // time for every process to boot and connect
    $procs = [];
    foreach ($emails as $email) {
        $cmd = 'php ' . escapeshellarg(__DIR__ . '/workers/book.php') . ' '
            . escapeshellarg($eventId) . ' ' . escapeshellarg($email) . ' ' . escapeshellarg((string) $startAt);
        $procs[] = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes) ?: throw new RuntimeException('spawn');
        $outputs[] = $pipes;
    }
    $results = [];
    foreach ($procs as $i => $proc) {
        $out = stream_get_contents($outputs[$i][1]);
        $err = stream_get_contents($outputs[$i][2]);
        proc_close($proc);
        $decoded = json_decode((string) $out, true);
        $results[] = is_array($decoded) ? $decoded : ['ok' => false, 'reason' => 'crash: ' . trim($err . $out)];
    }
    return $results;
}

/** @param list<array<string, mixed>> $results */
function tally(array $results): array
{
    $t = ['ok' => 0, 'sold_out' => 0, 'already_reserved' => 0, 'other' => 0];
    foreach ($results as $r) {
        if ($r['ok'] ?? false) {
            $t['ok']++;
        } elseif (isset($t[$r['reason'] ?? ''])) {
            $t[$r['reason']]++;
        } else {
            $t['other']++;
            echo '        unexpected: ' . json_encode($r) . "\n";
        }
    }
    return $t;
}

echo "R1 — last seat, 8 simultaneous attempts (5 rounds):\n";
for ($round = 1; $round <= 5; $round++) {
    $event = t_event($pdo, ['title' => "Un lugar #{$round}", 'capacity' => 1]);
    $emails = array_map(static fn (int $i): string => "r{$round}p{$i}@example.com", range(1, 8));
    $t = tally(parallel_bookings($event, $emails));
    $rows = (int) $pdo->query('SELECT COUNT(*) FROM reservations WHERE event_id = ' . $pdo->quote($event))->fetchColumn();
    check($t['ok'] === 1 && $t['sold_out'] === 7 && $rows === 1,
        "round {$round}: {$t['ok']} accepted, {$t['sold_out']} sold_out, {$rows} row in the database");
}

echo "\nSame person twice at the same instant (event with 5 seats, 3 rounds):\n";
for ($round = 1; $round <= 3; $round++) {
    $event = t_event($pdo, ['title' => "Cinco lugares #{$round}", 'capacity' => 5]);
    $t = tally(parallel_bookings($event, ["mismo{$round}@example.com", "MISMO{$round}@example.com"]));
    check($t['ok'] === 1 && $t['already_reserved'] === 1,
        "round {$round}: {$t['ok']} ok + {$t['already_reserved']} already_reserved (email case does not matter)");
}

echo "\nCapacity 3, 10 simultaneous attempts:\n";
$event = t_event($pdo, ['title' => 'Tres lugares', 'capacity' => 3]);
$t = tally(parallel_bookings($event, array_map(static fn (int $i): string => "tres{$i}@example.com", range(1, 10))));
check($t['ok'] === 3 && $t['sold_out'] === 7, "exactly 3 accepted and 7 sold_out (got {$t['ok']} / {$t['sold_out']})");

echo "\nExpired holds (materialization, same as T10):\n";
$input = ['full_name' => 'Ana', 'email' => 'ana@example.com', 'whatsapp' => '2494000000', 'has_condition' => false, 'condition_details' => null, 'marketing_consent' => false];
$event = t_event($pdo, ['capacity' => 5]);
$first = Reservations::create($event, $input);
check($first['ok'] === true, 'a first booking is accepted');
$again = Reservations::create($event, $input);
check($again === ['ok' => false, 'reason' => 'already_reserved'], 'while the hold is LIVE, the same person gets already_reserved');
$pdo->prepare('UPDATE reservations SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE public_token = ?')->execute([$first['token']]);
$afterExpiry = Reservations::create($event, $input);
check($afterExpiry['ok'] === true, 'after the hold EXPIRES, the same person CAN book again');
$old = $pdo->prepare('SELECT status FROM reservations WHERE public_token = ?');
$old->execute([$first['token']]);
check($old->fetchColumn() === 'expired', 'the old hold was written as "expired" (history kept)');
$fullEvent = t_event($pdo, ['capacity' => 1]);
$hold = Reservations::create($fullEvent, ['email' => 'uno@example.com'] + $input);
$pdo->prepare('UPDATE reservations SET expires_at = NOW() - INTERVAL 1 SECOND WHERE public_token = ?')->execute([$hold['token']]);
$other = Reservations::create($fullEvent, ['email' => 'otro@example.com'] + $input);
check($other['ok'] === true, 'on a 1-seat event, an expired hold frees the seat for someone else');

echo "\nNot bookable:\n";
$draft = t_event($pdo, ['is_published' => 0]);
check(Reservations::create($draft, $input) === ['ok' => false, 'reason' => 'not_found'], 'a draft cannot be booked');
$started = t_event($pdo, ['starts_at' => gmdate('Y-m-d H:i:s', time() - 60)]);
check(Reservations::create($started, $input) === ['ok' => false, 'reason' => 'not_found'], 'an event that already started cannot be booked');

echo "\nBooking form over HTTP:\n";
$base = start_test_server(write_test_config());
$event = t_event($pdo, ['title' => 'Taller HTTP', 'capacity' => 2]);

[$status, $headers, $form] = http('GET', "{$base}/eventos/{$event}/reservar");
check($status === 200 && str_contains($form, 'Paso 1 de 2 · Tus datos') && str_contains($form, 'Número de teléfono'), 'the form renders (step 1, phone field)');
check(!str_contains($form, 'términos'), 'there is no terms checkbox (decision D2)');
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $form, $m);
$csrf = $m[1] ?? '';
$cookie = '';
foreach ($headers['set-cookie'] ?? [] as $c) {
    $cookie = explode(';', $c)[0];
}
check($csrf !== '' && str_starts_with($cookie, 'casa_session='), 'it issues a session cookie and a CSRF token');
$setCookie = implode(' ', $headers['set-cookie'] ?? []);
check(stripos($setCookie, 'HttpOnly') !== false && stripos($setCookie, 'SameSite=Lax') !== false, 'the session cookie is HttpOnly and SameSite=Lax');

$valid = ['fullName' => 'Lucía Pérez', 'email' => ' Lucia@Example.COM ', 'whatsapp' => '2494 15 123456', 'hasHealthCondition' => 'yes', 'healthCondition' => 'Celiaquía', 'marketingConsent' => 'on'];
[$status] = http('POST', "{$base}/eventos/{$event}/reservar", ['body' => http_build_query($valid), 'cookie' => $cookie]);
check($status === 403, 'a POST without the CSRF token is rejected (403)');
[$status] = http('POST', "{$base}/eventos/{$event}/reservar", ['body' => http_build_query($valid + ['_csrf' => str_repeat('0', 64)]), 'cookie' => $cookie]);
check($status === 403, 'a POST with a wrong CSRF token is rejected (403)');

[$status, , $body] = http('POST', "{$base}/eventos/{$event}/reservar", ['body' => http_build_query(['_csrf' => $csrf, 'hasHealthCondition' => 'yes', 'email' => 'no-es-mail']), 'cookie' => $cookie]);
check($status === 422, 'invalid data answers 422 and stays on the form');
foreach (['Ingresá tu nombre y apellido', 'Ingresá un email válido', 'Ingresá tu WhatsApp', 'Contanos brevemente cuál es la condición'] as $msg) {
    check(str_contains($body, $msg), "shows: \"{$msg}\"");
}
check(str_contains($body, 'value="no-es-mail"'), 'what the person typed is kept');
check((int) $pdo->query('SELECT COUNT(*) FROM reservations WHERE event_id = ' . $pdo->quote($event))->fetchColumn() === 0, 'invalid input never touched the database');

[$status, $headers] = http('POST', "{$base}/eventos/{$event}/reservar", ['body' => http_build_query($valid + ['_csrf' => $csrf]), 'cookie' => $cookie]);
$location = $headers['location'][0] ?? '';
check($status === 303 && preg_match('#^/reservas/[A-Za-z0-9_-]{43}$#', $location) === 1, "a valid booking redirects (303) to the secret link {$location}");
$row = $pdo->query('SELECT c.email, c.full_name, c.marketing_consent, c.marketing_consent_at IS NOT NULL AS consent_at,
                           r.status, r.has_condition, r.condition_details, r.terms_accepted_at,
                           TIMESTAMPDIFF(MINUTE, NOW(), r.expires_at) AS minutes_left
                    FROM reservations r JOIN customers c ON c.id = r.customer_id
                    WHERE r.event_id = ' . $pdo->quote($event))->fetch();
check($row['email'] === 'lucia@example.com', 'the email is stored trimmed and lowercased');
check($row['full_name'] === 'Lucía Pérez', 'the name keeps its accents');
check($row['status'] === 'pending_no_receipt' && in_array((int) $row['minutes_left'], [29, 30], true), 'status pending_no_receipt, held for 30 minutes by the database clock');
check((int) $row['has_condition'] === 1 && $row['condition_details'] === 'Celiaquía', 'the declared health condition is stored');
check((int) $row['marketing_consent'] === 1 && (int) $row['consent_at'] === 1, 'the optional marketing consent is stored with its date');
check($row['terms_accepted_at'] === null, 'no terms acceptance is recorded (the person never saw any)');
[$status, , $body] = http('GET', $base . $location);
check($status === 200 && str_contains($body, 'Taller HTTP'), 'the secret link opens');

[$status, , $body] = http('POST', "{$base}/eventos/{$event}/reservar", ['body' => http_build_query($valid + ['_csrf' => $csrf]), 'cookie' => $cookie]);
check($status === 422 && str_contains($body, 'Ya tenés una reserva para este evento.'), 'booking twice shows "Ya tenés una reserva para este evento."');
$valid2 = ['email' => 'otra@example.com', 'hasHealthCondition' => 'no', 'healthCondition' => 'esto se ignora'] + $valid;
http('POST', "{$base}/eventos/{$event}/reservar", ['body' => http_build_query($valid2 + ['_csrf' => $csrf]), 'cookie' => $cookie]);
$ignored = $pdo->query("SELECT r.condition_details FROM reservations r JOIN customers c ON c.id = r.customer_id WHERE c.email = 'otra@example.com'")->fetchColumn();
check($ignored === null, 'with "No", any typed condition text is discarded');
$valid3 = ['email' => 'tercera@example.com'] + $valid;
[$status, , $body] = http('POST', "{$base}/eventos/{$event}/reservar", ['body' => http_build_query($valid3 + ['_csrf' => $csrf]), 'cookie' => $cookie]);
check($status === 422 && str_contains($body, 'Se agotaron los lugares para este evento.'), 'when full, the form says "Se agotaron los lugares para este evento."');

[$status] = http('GET', "{$base}/eventos/{$draft}/reservar");
check($status === 404, 'the form for a draft answers 404');
[$status] = http('GET', "{$base}/eventos/{$started}/reservar");
check($status === 404, 'the form for an event that already started answers 404');
[$status] = http('GET', "{$base}/reservas/" . Reservations::newToken());
check($status === 404, 'an unknown secret link answers 404');

finish();
