<?php
/*
 * P12 — client list, CSV export and "Copiar mails" (port of
 * scripts/verify-clients.mjs, plus HTTP and a real browser click):
 *   - one row per client, aggregates checked against an independent SQL
 *     oracle (stored status + expires_at), newest activity first
 *   - search by name / email / WhatsApp; a typed % _ or ! matches literally
 *   - CSV: BOM, CRLF, every field quoted, byte-exact; NO health data and no
 *     consent column; without marketing consent the email reads
 *     "sin consentimiento" in the page, the CSV and the copy button
 *   - the export requires the admin session before any data is read
 *
 * Run: php tests/verify-clients.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));

$customer = static function (string $name, string $email, string $phone, bool $consent) use ($pdo): string {
    $id = t_uuid();
    $pdo->prepare('INSERT INTO customers (id, full_name, email, whatsapp, marketing_consent, marketing_consent_at) VALUES (?, ?, ?, ?, ?, IF(?, NOW(), NULL))')
        ->execute([$id, $name, $email, $phone, (int) $consent, (int) $consent]);
    return $id;
};
$reserve = static function (string $event, string $customerId, string $status, ?string $expires, string $createdAgo) use ($pdo): string {
    $id = t_uuid();
    $pdo->prepare("INSERT INTO reservations (id, event_id, customer_id, status, public_token, expires_at, has_condition, condition_details, created_at)
                   VALUES (?, ?, ?, ?, ?, " . ($expires ?? 'NULL') . ", 1, 'CONDICION-SECRETA asma', NOW() - INTERVAL {$createdAgo})")
        ->execute([$id, $event, $customerId, $status, bin2hex(random_bytes(32))]);
    return $id;
};
$e1 = t_event($pdo, ['title' => 'Uno']);
$e2 = t_event($pdo, ['title' => 'Dos']);
$e3 = t_event($pdo, ['title' => 'Tres']);
$alpha = $customer('Alpha García', 'alpha@example.com', '+54 9 11 1111-2222', true);
$beta = $customer('Beta Pérez', 'beta-secreta@example.com', '2494 3332-99', false);
$gamma = $customer("Gamma, \"La\" Rúa", 'gamma@example.com', '2494 55-6677', true);
$nobody = $customer('Sin Reservas', 'nadie@example.com', '111', true);
$reserve($e1, $alpha, 'approved', null, '3 DAY');
$reserve($e2, $alpha, 'pending_no_receipt', 'NOW() - INTERVAL 1 MINUTE', '1 HOUR');   // lapsed: total but not active
$reserve($e3, $alpha, 'pending_no_receipt', 'NOW() + INTERVAL 10 MINUTE', '5 MINUTE'); // live hold: active
$reserve($e1, $beta, 'rejected', null, '2 DAY');
$reserve($e2, $beta, 'pending_review', null, '2 HOUR');
$reserve($e1, $gamma, 'cancelled', null, '10 DAY');

echo "Aggregates against an independent oracle:\n";
$rows = Clients::list(null);
$oracle = $pdo->query("SELECT c.id,
        (SELECT COUNT(*) FROM reservations x WHERE x.customer_id = c.id) AS total,
        (SELECT COUNT(*) FROM reservations x WHERE x.customer_id = c.id
            AND (x.status IN ('pending_review', 'approved') OR (x.status = 'pending_no_receipt' AND x.expires_at > NOW()))) AS active
      FROM customers c WHERE EXISTS (SELECT 1 FROM reservations x WHERE x.customer_id = c.id)")->fetchAll(PDO::FETCH_ASSOC);
$byId = array_column($rows, null, 'id');
$match = count($rows) === count($oracle);
foreach ($oracle as $o) {
    $match = $match && isset($byId[$o['id']]) && $byId[$o['id']]['total_reservations'] === (int) $o['total'] && $byId[$o['id']]['active_reservations'] === (int) $o['active'];
}
check($match, 'totals and actives equal the oracle for every client');
check([$byId[$alpha]['total_reservations'], $byId[$alpha]['active_reservations']] === [3, 2], 'Alpha: 3 reservations, 2 active (the lapsed hold stops counting, no cron)');
check([$byId[$beta]['active_reservations'], $byId[$gamma]['active_reservations']] === [1, 0], 'Beta: 1 active (in review, rejected does not count); Gamma: 0 (cancelled)');
check(!isset($byId[$nobody]), 'a customer without reservations is not listed');
check(array_column($rows, 'id') === [$alpha, $beta, $gamma], 'ordered by most recent reservation (Alpha 5 min, Beta 2 h, Gamma 10 days)');
check(array_intersect(array_keys($rows[0]), ['has_condition', 'condition_details']) === [], 'rows carry no health fields');

echo "\nSearch:\n";
$names = static fn (?string $q): array => array_column(Clients::list($q), 'full_name');
check($names('ALPHA') === ['Alpha García'], 'name fragment, case-insensitive');
check($names('beta-') === ['Beta Pérez'], 'email fragment');
check($names('3332') === ['Beta Pérez'], 'WhatsApp fragment');
check($names('garcia') === ['Alpha García'], 'accent-insensitive too ("garcia" finds "García"; MySQL collation, a small plus over Postgres ILIKE)');
check($names('%') === [] && $names('_') === [] && $names('a%a') === [] && $names('!') === [] && $names('!%') === [], 'a typed % _ or ! matches literally (never lists everyone)');
check(Validation::clientSearch(['search' => '  Alpha  ']) === 'Alpha' && Validation::clientSearch(['search' => str_repeat('x', 101)]) === null
    && Validation::clientSearch(['search' => ['a', 'b']]) === null && Validation::clientSearch([]) === null && Validation::clientSearch(['search' => '']) === null,
    'search trimmed; >100 chars, an array, missing or empty -> no filter');

echo "\nCSV:\n";
$crafted = [
    ['full_name' => "Doe, \"Jr\"\nSegunda línea", 'email' => 'a@b.c', 'whatsapp' => '+54 9 11 1111-2222', 'marketing_consent' => true,
     'total_reservations' => 2, 'active_reservations' => 1, 'last_reservation_at' => '2026-05-10 21:30:00'],
    ['full_name' => 'Rowe', 'email' => 'x@y.z', 'whatsapp' => '', 'marketing_consent' => false,
     'total_reservations' => 0, 'active_reservations' => 0, 'last_reservation_at' => null],
];
$expected = "\u{FEFF}\"Nombre\",\"Email\",\"WhatsApp\",\"Reservas totales\",\"Reservas activas\",\"Última reserva\"\r\n"
    . "\"Doe, \"\"Jr\"\"\nSegunda línea\",\"a@b.c\",\"+54 9 11 1111-2222\",\"2\",\"1\",\"10 de mayo de 2026, 18:30\"\r\n"
    . "\"Rowe\",\"sin consentimiento\",\"\",\"0\",\"0\",\"\"\r\n";
check(Clients::toCsv($crafted) === $expected, 'crafted CSV byte-exact: BOM, CRLF, quoting, doubled quotes, Buenos Aires date, "sin consentimiento"');
check(Clients::toCsv([]) === "\u{FEFF}\"Nombre\",\"Email\",\"WhatsApp\",\"Reservas totales\",\"Reservas activas\",\"Última reserva\"\r\n", 'empty list: BOM + header + CRLF only');
$tmp = tempnam(sys_get_temp_dir(), 'csv');
file_put_contents($tmp, substr(Clients::toCsv($crafted), 3));
$fh = fopen($tmp, 'r');
$parsed = [];
while (($line = fgetcsv($fh, null, ',', '"', '')) !== false) {
    $parsed[] = $line;
}
fclose($fh);
unlink($tmp);
check(count($parsed) === 3 && $parsed[1][0] === "Doe, \"Jr\"\nSegunda línea", 'a standard CSV parser reads it back: 3 rows, the dirty field intact');

echo "\nOver HTTP:\n";
$password = 'clave-del-panel-larga';
$base = start_test_server(write_test_config(['admin' => ['user' => 'duena', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)]]));
foreach (['/admin/clientes', '/admin/clientes/export', '/admin/clientes/export?search=alpha'] as $path) {
    [$code, $h, $body] = http('GET', $base . $path);
    check($code === 307 && ($h['location'][0] ?? '') === '/admin/login' && !str_contains($body, 'alpha@example.com') && !str_contains($body, 'Nombre'), "without a session {$path} -> 307, no data");
}
[, $h, $html] = http('GET', "{$base}/admin/login");
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
$cookie = explode(';', ($h['set-cookie'] ?? [''])[count($h['set-cookie'] ?? ['']) - 1])[0];
[, $h] = http('POST', "{$base}/admin/login", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $m[1], 'username' => 'duena', 'password' => $password])]);
foreach ($h['set-cookie'] ?? [] as $c) {
    $cookie = explode(';', $c)[0];
}

[$code, , $html] = http('GET', "{$base}/admin/clientes", ['cookie' => $cookie]);
check($code === 200 && str_contains($html, 'Tu base de contactos: mirá qué reservó cada persona y exportala en CSV.') && str_contains($html, '3 reservas · 2 activas') && str_contains($html, '1 activa'), 'the page renders with the original texts and the aggregates');
check(!str_contains($html, 'CONDICION-SECRETA') && !str_contains($html, 'asma'), 'no health condition in the page');
check(!str_contains($html, 'beta-secreta@example.com') && str_contains($html, 'sin consentimiento · 2494 3332-99'), 'Beta has no consent: email hidden, "sin consentimiento"');
preg_match('/data-copy-emails="([^"]*)"/', $html, $mm);
$copy = json_decode(html_entity_decode($mm[1] ?? '', ENT_QUOTES | ENT_HTML5), true);
check($copy === ['alpha@example.com', 'gamma@example.com'], 'copy button carries only the consenting emails, in list order');

[$code, $h, $csv] = http('GET', "{$base}/admin/clientes/export", ['cookie' => $cookie]);
check($code === 200 && ($h['content-type'][0] ?? '') === 'text/csv; charset=utf-8' && preg_match('/^attachment; filename="clientes-\d{4}-\d{2}-\d{2}\.csv"$/', $h['content-disposition'][0] ?? '') === 1 && str_contains($h['cache-control'][0] ?? '', 'no-store'), 'export: text/csv, attachment clientes-AAAA-MM-DD.csv, no-store');
check(str_starts_with($csv, "\u{FEFF}\"Nombre\",\"Email\",\"WhatsApp\",\"Reservas totales\",\"Reservas activas\",\"Última reserva\"\r\n") && substr_count($csv, "\r\n") === 4, 'BOM, the six columns, header + 3 clients');
check(!str_contains($csv, 'CONDICION') && !str_contains($csv, 'asma') && !preg_match('/salud|condici|consentimiento de marketing/i', explode("\r\n", $csv)[0]), 'THE CSV CONTAINS NO HEALTH DATA (nor a health or consent column)');
check(!str_contains($csv, 'beta-secreta@example.com') && str_contains($csv, '"Beta Pérez","sin consentimiento","2494 3332-99","2","1"'), 'the CSV hides the email of the client without consent');
check(str_contains($csv, "\"Gamma, \"\"La\"\" Rúa\",\"gamma@example.com\""), 'a name with comma and quotes is quoted correctly');
[, , $csv] = http('GET', "{$base}/admin/clientes/export?search=" . rawurlencode('alpha'), ['cookie' => $cookie]);
check(substr_count($csv, "\r\n") === 2 && str_contains($csv, 'Alpha García'), 'export respects the search on screen (?search=alpha -> 1 row)');
[, , $html] = http('GET', "{$base}/admin/clientes?search=" . rawurlencode('%'), ['cookie' => $cookie]);
check(str_contains($html, 'No hay clientes que coincidan con la búsqueda.') && str_contains($html, 'title="No hay clientes para copiar"') && preg_match('/data-copy-emails="[^"]*" disabled/', $html) === 1, '"%" -> no results, copy button disabled');
[, , $html] = http('GET', "{$base}/admin/clientes?search=" . rawurlencode('beta'), ['cookie' => $cookie]);
check(str_contains($html, 'href="/admin/clientes/export?search=beta"') && str_contains($html, 'Limpiar'), 'the export link carries the current search');

echo "\nCopiar mails in a real browser (Chromium):\n";
$out = shell_exec('node ' . escapeshellarg(__DIR__ . '/browser/copy-emails.cjs') . ' ' . escapeshellarg($base) . ' ' . escapeshellarg(explode('=', $cookie, 2)[1]) . " '' 2>&1");
$browser = json_decode((string) $out, true);
check(is_array($browser) && ($browser['clipboard'] ?? null) === 'alpha@example.com, gamma@example.com', 'the clipboard holds "alpha@example.com, gamma@example.com" (' . trim((string) $out) . ')');
check(is_array($browser) && ($browser['label'] ?? '') === 'Mails copiados' && ($browser['stayed'] ?? false) === true, 'the button says "Mails copiados" and does not submit the search form');

finish();
