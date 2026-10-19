<?php
/*
 * P11 — one-tap WhatsApp from the reservation detail (port of
 * scripts/verify-whatsapp.mjs, plus a golden comparison and HTTP):
 *   - tests/fixtures/whatsapp-golden.json was produced by running the REAL
 *     src/lib/whatsapp.ts of the Next.js version (Node, type stripping) over
 *     18 phone numbers, 4 messages and 3 x 7 reservation inputs. Every PHP
 *     output must be byte-identical: normalization, link and message
 *   - the original assertion table (prefixes, round trip, null for bad
 *     numbers, per-state details, no emojis)
 *   - the panel shows the link built from the EFFECTIVE state, only with an
 *     admin session, and a note instead of a broken button for a bad number
 *
 * Run: php tests/verify-whatsapp.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

echo "Golden outputs from the original TypeScript:\n";
$golden = json_decode((string) file_get_contents(__DIR__ . '/fixtures/whatsapp-golden.json'), true, 512, JSON_THROW_ON_ERROR);
$diff = [];
foreach ($golden['normalize'] as [$raw, $expected]) {
    if (WhatsApp::normalize($raw) !== $expected) {
        $diff[] = "normalize({$raw})";
    }
}
check($diff === [], count($golden['normalize']) . ' normalizations identical' . ($diff ? ': ' . implode(', ', $diff) : ''));
$diff = [];
foreach ($golden['links'] as [$phone, $message, $expected]) {
    if (WhatsApp::deepLink($phone, $message) !== $expected) {
        $diff[] = json_encode([$phone, $message, WhatsApp::deepLink($phone, $message), $expected], JSON_UNESCAPED_UNICODE);
    }
}
check($diff === [], count($golden['links']) . ' deep links identical (incl. null for bad numbers, emoji, & ? # % \' ( ) * ~ !, newline)' . ($diff ? ': ' . implode("\n", $diff) : ''));
$diff = [];
foreach ($golden['messages'] as [$input, $expected]) {
    $actual = WhatsApp::reservationMessage($input);
    if ($actual !== $expected) {
        $diff[] = "{$input['effective_status']}:\n      php: {$actual}\n      ts:  {$expected}";
    }
}
check($diff === [], count($golden['messages']) . ' messages identical (6 states + unknown, with/without deadline, alias and reason)' . ($diff ? "\n    " . implode("\n    ", $diff) : ''));

echo "\nOriginal assertion table:\n";
foreach ([['11 5555-6666', '541155556666'], ['011-5555-6666', '541155556666'], ['+54 9 11 5555 6666', '5491155556666'],
          ['5491155556666', '5491155556666'], ['15 5555 6666', '5455556666'], ['0054 9 11 5555-6666', '5491155556666'],
          ['+54 (11) 5555-6666 con letras y espacios', '541155556666']] as [$raw, $expected]) {
    check(WhatsApp::normalize($raw) === $expected, "normalize(\"{$raw}\") -> \"{$expected}\"");
}
$message = '¡Hola María! Tu reserva está CONFIRMADA. ¡Gracias!';
$link = (string) WhatsApp::deepLink('11 5555-6666', $message);
check(str_starts_with($link, 'https://wa.me/541155556666?text='), 'link starts with https://wa.me/<digits>?text=');
check(rawurldecode(substr($link, strpos($link, '?text=') + 6)) === $message, 'decoded ?text= is EXACTLY the message (round trip)');
check(str_starts_with((string) WhatsApp::deepLink('+54 9 11 5555 6666', 'Hola'), 'https://wa.me/5491155556666?text='), '13-digit number keeps 549 + 11 digits');
foreach (['555666', '54911555566', '54911555566666', 'abc', ''] as $bad) {
    check(WhatsApp::deepLink($bad, 'Hola') === null, "non-plausible number \"{$bad}\" -> null");
}
$input = static fn (array $o = []): array => $o + [
    'full_name' => 'María Elena García', 'event_title' => 'Taller de cerámica', 'event_starts_at' => '2026-11-21 21:00:00',
    'event_price' => "\$\u{00A0}15.000,00", 'expires_at' => '2026-11-21 21:30:00', 'rejection_reason' => null,
    'payment_alias' => 'casa.de.anton.mp', 'effective_status' => 'pending_no_receipt',
];
$ok = true;
foreach (ReservationsAdmin::STATUSES as $st) {
    $m = WhatsApp::reservationMessage($input(['effective_status' => $st]));
    $ok = $ok && str_contains($m, 'María') && !str_contains($m, 'Elena') && str_contains($m, 'Taller de cerámica') && !preg_match('/\p{Extended_Pictographic}/u', $m);
}
check($ok, 'every state: first name only, event title, no emojis');
$hold = WhatsApp::reservationMessage($input());
check(str_contains($hold, 'antes del 21 de noviembre de 2026, 18:30') && str_contains($hold, "\$\u{00A0}15.000,00") && str_contains($hold, 'casa.de.anton.mp'), 'hold: deadline in Buenos Aires time, price and alias');
$noExp = WhatsApp::reservationMessage($input(['expires_at' => null]));
check(str_contains($noExp, 'el lugar se libera solo') && !str_contains($noExp, 'antes del'), 'hold without deadline: no dangling "antes del"');
check(str_contains(WhatsApp::reservationMessage($input(['payment_alias' => null])), 'al alias que te pasamos por este chat'), 'hold without alias: fallback phrasing');
check(str_contains(WhatsApp::reservationMessage($input(['effective_status' => 'rejected', 'rejection_reason' => 'El comprobante no se ve bien.'])), 'tu reserva para Taller de cerámica. El comprobante no se ve bien. Si querés'), 'rejected: embeds the reason');
check(str_contains(WhatsApp::reservationMessage($input(['effective_status' => 'approved'])), 'el sábado 21 de noviembre a las 18 hs está CONFIRMADA'), 'approved: date, time and CONFIRMADA');

echo "\nIn the panel:\n";
$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));
$password = 'clave-del-panel-larga';
$base = start_test_server(write_test_config(['payment_alias' => 'alias.del.local', 'admin' => ['user' => 'duena', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)]]));
$ev = t_event($pdo, ['title' => 'Té & acuarelas', 'capacity' => 5, 'starts_at' => '2026-11-21 21:00:00', 'ends_at' => '2026-11-21 23:00:00']);
$customer = static function (string $email, string $phone) use ($pdo): string {
    $id = t_customer($pdo, $email);
    $pdo->prepare("UPDATE customers SET full_name = 'Rocío Paz', whatsapp = ? WHERE id = ?")->execute([$phone, $id]);
    return $id;
};
$lapsed = t_reservation($pdo, $ev, $customer('a@example.com', '(0249) 431-4915'), 'pending_no_receipt', 'NOW() - INTERVAL 1 MINUTE');
$held = t_reservation($pdo, $ev, $customer('b@example.com', '+54 9 2494 31-4915'), 'pending_no_receipt', 'NOW() + INTERVAL 20 MINUTE');
$badPhone = t_reservation($pdo, $ev, $customer('c@example.com', 'sin número'), 'approved');

[$code, $h] = http('GET', "{$base}/admin/reservas/{$held}");
check($code === 307, 'without a session the detail (and its link) is not reachable');
[, $h, $html] = http('GET', "{$base}/admin/login");
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
$cookie = explode(';', ($h['set-cookie'] ?? [''])[count($h['set-cookie'] ?? ['']) - 1])[0];
[, $h] = http('POST', "{$base}/admin/login", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $m[1], 'username' => 'duena', 'password' => $password])]);
foreach ($h['set-cookie'] ?? [] as $c) {
    $cookie = explode(';', $c)[0];
}
$linkIn = static function (string $html): ?string {
    return preg_match('#href="(https://wa\.me/[0-9]+\?text=[^"]+)"#', $html, $mm) ? html_entity_decode($mm[1], ENT_QUOTES | ENT_HTML5) : null;
};
[, , $html] = http('GET', "{$base}/admin/reservas/{$held}", ['cookie' => $cookie]);
$l = $linkIn($html);
$text = $l !== null ? rawurldecode(substr($l, strpos($l, '?text=') + 6)) : '';
check($l !== null && str_starts_with($l, 'https://wa.me/5492494314915?text='), 'live hold: link to 5492494314915');
check(str_starts_with($text, '¡Hola Rocío! Te guardamos el lugar para Té & acuarelas el sábado 21 de noviembre a las 18 hs.') && str_contains($text, 'al alias alias.del.local antes del '), 'message for the live hold, with the configured alias and the "&" intact');
check(str_contains($html, 'target="_blank" rel="noopener noreferrer"') && str_contains($html, 'el envío es manual, nada se manda solo'), 'opens in a new tab; the page says nothing is sent automatically');
[, , $html] = http('GET', "{$base}/admin/reservas/{$lapsed}", ['cookie' => $cookie]);
$l = $linkIn($html);
$text = $l !== null ? rawurldecode(substr($l, strpos($l, '?text=') + 6)) : '';
check($l !== null && str_starts_with($l, 'https://wa.me/542494314915?text=') && str_starts_with($text, '¡Hola Rocío! Se venció el plazo'), 'lapsed hold: number (0249) 431-4915 normalized, and the EXPIRED message (effective state)');
[, , $html] = http('GET', "{$base}/admin/reservas/{$badPhone}", ['cookie' => $cookie]);
check($linkIn($html) === null && str_contains($html, 'El número sin número no tiene un formato que WhatsApp pueda abrir.'), 'unusable number: no button, the original note instead');

finish();
