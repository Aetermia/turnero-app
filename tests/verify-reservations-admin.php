<?php
/*
 * P9 — reservation management from the panel (equivalent to the approve /
 * reject checks of the Next.js version, plus HTTP, a race and R2):
 *   - rejecting frees exactly one seat and lets the same person book again;
 *     approving leaves every count identical
 *   - only pending_review can be resolved; a double click changes it once;
 *     8 parallel approve/reject calls -> exactly one wins
 *   - malformed ids are false / null / 404, never a 500
 *   - the list filters by event and by EFFECTIVE status (an unpaid hold past
 *     its 30 minutes filters as "Expirada") and never shows health data
 *   - the receipt is streamed only to an admin session (R2): no session, a
 *     forged cookie or a plain visitor session get 307 and not one byte
 *   - CSRF on approve and reject; rejection reason trimmed, max 500, empty -> NULL
 *
 * Run: php tests/verify-reservations-admin.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));
$receiptDirs = [];
register_shutdown_function(static function () use (&$receiptDirs): void {
    foreach ($receiptDirs as $id) {
        array_map('unlink', glob(Receipts::directory() . "/{$id}/*") ?: []);
        @rmdir(Receipts::directory() . "/{$id}");
    }
});

$person = static fn (string $email): string => t_customer($pdo, $email);
$status = static fn (string $id): string => (string) $pdo->query('SELECT status FROM reservations WHERE id = ' . $pdo->quote($id))->fetchColumn();
$booking = static fn (string $email): array => [
    'full_name' => 'Persona de prueba', 'email' => $email, 'whatsapp' => '2494000000',
    'has_condition' => false, 'condition_details' => null, 'marketing_consent' => false,
];

echo "Reject frees exactly one seat, approve changes nothing:\n";
$ev = t_event($pdo, ['title' => 'Cupo cinco', 'capacity' => 5]);
$toReject = t_reservation($pdo, $ev, $person('rechazo@example.com'), 'pending_review');
$toApprove = t_reservation($pdo, $ev, $person('aprobado@example.com'), 'pending_review');
$before = EventsAdmin::find($ev);
check($before['occupied'] === 2 && $before['seats_available'] === 3, 'start: 2 occupied, 3 available');
check(ReservationsAdmin::approve($toApprove) === true, 'approve a pending_review reservation -> true');
$afterApprove = EventsAdmin::find($ev);
check($afterApprove['occupied'] === 2 && $afterApprove['seats_available'] === 3, 'after approving: still 2 occupied, 3 available (identical counts)');
check($status($toApprove) === 'approved' && $pdo->query("SELECT resolved_at IS NOT NULL FROM reservations WHERE id = " . $pdo->quote($toApprove))->fetchColumn() == 1, 'status approved and resolved_at recorded');
check(ReservationsAdmin::reject($toReject, 'El monto no coincide') === true, 'reject a pending_review reservation -> true');
$afterReject = EventsAdmin::find($ev);
check($afterReject['occupied'] === 1 && $afterReject['seats_available'] === 4, 'after rejecting: 1 occupied, 4 available (exactly one seat freed)');
check($pdo->query('SELECT rejection_reason FROM reservations WHERE id = ' . $pdo->quote($toReject))->fetchColumn() === 'El monto no coincide', 'the reason is stored');
$again = Reservations::create($ev, $booking('rechazo@example.com'));
check(($again['ok'] ?? false) === true, 'the rejected person can book the same event again');

echo "\nOne seat event: reject reopens it, approve keeps it closed:\n";
$one = t_event($pdo, ['title' => 'Un lugar', 'capacity' => 1]);
$held = t_reservation($pdo, $one, $person('unico@example.com'), 'pending_review');
check(Reservations::create($one, $booking('otra@example.com'))['reason'] === 'sold_out', 'while in review the event is sold out');
ReservationsAdmin::approve($held);
check(Reservations::create($one, $booking('otra@example.com'))['reason'] === 'sold_out', 'approved: still sold out');
$one2 = t_event($pdo, ['title' => 'Un lugar 2', 'capacity' => 1]);
$held2 = t_reservation($pdo, $one2, $person('unico2@example.com'), 'pending_review');
ReservationsAdmin::reject($held2, null);
check((Reservations::create($one2, $booking('otra@example.com'))['ok'] ?? false) === true, 'rejected: the next person gets the seat');

echo "\nOnly pending_review can be resolved:\n";
$double = t_reservation($pdo, $ev, $person('doble@example.com'), 'pending_review');
check(ReservationsAdmin::approve($double) === true && ReservationsAdmin::approve($double) === false, 'double click on approve: true, then false');
check(ReservationsAdmin::reject($double, 'tarde') === false && $status($double) === 'approved', 'rejecting an approved reservation -> false, it stays approved');
$states = [
    'pending_no_receipt' => t_reservation($pdo, $ev, $person('sin@example.com'), 'pending_no_receipt', 'NOW() + INTERVAL 20 MINUTE'),
    'expired' => t_reservation($pdo, $ev, $person('exp@example.com'), 'expired'),
    'cancelled' => t_reservation($pdo, $ev, $person('can@example.com'), 'cancelled'),
    'rejected' => t_reservation($pdo, $ev, $person('rej@example.com'), 'rejected'),
];
$untouched = true;
foreach ($states as $state => $rid) {
    $untouched = $untouched && ReservationsAdmin::approve($rid) === false && ReservationsAdmin::reject($rid, 'x') === false && $status($rid) === $state;
}
check($untouched, 'pending_no_receipt, expired, cancelled and rejected: approve and reject both false, status untouched');
check(ReservationsAdmin::approve('no-es-uuid') === false && ReservationsAdmin::reject("x' OR 1=1 -- ", null) === false && ReservationsAdmin::find('../../etc') === null && ReservationsAdmin::approve(t_uuid()) === false, 'malformed and unknown ids -> false / null');

echo "\nRace: 4 approve + 4 reject at the same instant (5 rounds):\n";
$raceOk = true;
for ($round = 1; $round <= 5; $round++) {
    $rid = t_reservation($pdo, $ev, $person("carrera{$round}@example.com"), 'pending_review');
    $startAt = microtime(true) + 1.0;
    $procs = [];
    foreach (['approve', 'reject', 'approve', 'reject', 'approve', 'reject', 'approve', 'reject'] as $action) {
        $procs[] = [$action, popen(sprintf('php %s %s %s %F', escapeshellarg(__DIR__ . '/workers/resolve.php'), $action, $rid, $startAt), 'r')];
    }
    $winners = [];
    foreach ($procs as [$action, $p]) {
        if (trim((string) stream_get_contents($p)) === '1') {
            $winners[] = $action;
        }
        pclose($p);
    }
    $final = $status($rid);
    $expected = count($winners) === 1 ? ($winners[0] === 'approve' ? 'approved' : 'rejected') : null;
    echo "    round {$round}: winners=" . implode(',', $winners) . " final={$final}\n";
    $raceOk = $raceOk && $expected === $final;
}
check($raceOk, 'every round: exactly one call wins and the final status is the winner\'s');

echo "\nList: filters and no health data:\n";
$other = t_event($pdo, ['title' => 'Otro evento', 'capacity' => 5]);
$sick = t_customer($pdo, 'salud@example.com');
$sickId = t_uuid();
$pdo->prepare("INSERT INTO reservations (id, event_id, customer_id, status, public_token, has_condition, condition_details)
               VALUES (?, ?, ?, 'pending_review', ?, 1, 'Asma leve, CONDICION-SECRETA')")
    ->execute([$sickId, $other, $sick, 'TOKEN-SECRETO-' . bin2hex(random_bytes(8))]);
$lapsed = t_reservation($pdo, $other, $person('vencida@example.com'), 'pending_no_receipt', 'NOW() - INTERVAL 1 MINUTE');
$all = ReservationsAdmin::list(['eventId' => null, 'status' => null]);
check(count($all) === (int) $pdo->query('SELECT COUNT(*) FROM reservations')->fetchColumn(), 'no filter: every reservation');
$byEvent = ReservationsAdmin::list(['eventId' => $other, 'status' => null]);
check(count($byEvent) === 2 && array_unique(array_column($byEvent, 'event_id')) === [$other], 'event filter: only that event');
$expiredRows = ReservationsAdmin::list(['eventId' => $other, 'status' => 'expired']);
check(array_column($expiredRows, 'id') === [$lapsed], 'status "expired" includes a hold past its 30 minutes (effective status, no cron)');
check(ReservationsAdmin::list(['eventId' => $other, 'status' => 'pending_no_receipt']) === [], 'and "pending_no_receipt" does not list it');
$keys = array_keys($all[0]);
check(array_intersect($keys, ['has_condition', 'condition_details', 'public_token']) === [], 'list rows carry no health fields and no token (' . implode(', ', $keys) . ')');
check(Validation::reservationFilters(['eventId' => 'basura', 'status' => 'whatever']) === ['eventId' => null, 'status' => null], 'bad filter values are ignored');
check(Validation::reservationFilters(['eventId' => [$other], 'status' => ['approved']]) === ['eventId' => null, 'status' => null], 'array filter values are ignored (no 500)');
check(Validation::rejectionReason(['rejectionReason' => "  \n "])['value'] === null && Validation::rejectionReason([])['value'] === null, 'blank or missing reason -> NULL');
check(Validation::rejectionReason(['rejectionReason' => '  Monto distinto  '])['value'] === 'Monto distinto', 'reason is trimmed');
check(Validation::rejectionReason(['rejectionReason' => str_repeat('ñ', 500)])['errors'] === [] && Validation::rejectionReason(['rejectionReason' => str_repeat('ñ', 501)])['errors'] === ['rejectionReason' => 'El motivo no puede superar los 500 caracteres'], '500 characters ok (multibyte), 501 rejected with the original message');

echo "\nPanel over HTTP:\n";
$password = 'clave-del-panel-larga';
$base = start_test_server(write_test_config(['admin' => ['user' => 'duena', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)]]));

// Receipts on disk, in the private folder, exactly like Receipts::store names them.
$jpgBytes = (string) file_get_contents(ROOT_DIR . '/public/img/logo.webp');
$pdfBytes = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
$attach = static function (string $rid, string $ext, string $mime, string $bytes) use ($pdo, &$receiptDirs): string {
    $receiptDirs[] = $rid;
    @mkdir(Receipts::directory() . "/{$rid}", 0700, true);
    $rel = "{$rid}/20261018120000-" . bin2hex(random_bytes(6)) . ".{$ext}";
    file_put_contents(Receipts::directory() . '/' . $rel, $bytes);
    $pdo->prepare('UPDATE reservations SET receipt_path = ?, receipt_mime_type = ?, receipt_uploaded_at = NOW(),
                   transfer_holder = ?, transfer_amount = ?, transfer_date = ?, transfer_reference = ? WHERE id = ?')
        ->execute([$rel, $mime, 'Titular Prueba', '15000.00', '2026-10-17', 'OP-123', $rid]);
    return $rel;
};
$imgRel = $attach($sickId, 'webp', 'image/webp', $jpgBytes);
$pdfRes = t_reservation($pdo, $other, $person('pdf@example.com'), 'pending_review');
$attach($pdfRes, 'pdf', 'application/pdf', $pdfBytes);
$noReceipt = t_reservation($pdo, $other, $person('sincomp@example.com'), 'pending_review');

foreach (["/admin/reservas", "/admin/reservas/{$sickId}", "/admin/reservas/{$sickId}/comprobante"] as $path) {
    [$code, $h, $body] = http('GET', $base . $path);
    check($code === 307 && ($h['location'][0] ?? '') === '/admin/login' && !str_contains($body, 'CONDICION-SECRETA') && !str_contains($body, substr($jpgBytes, 0, 64)), "without a session {$path} -> 307, no data");
}
[$code, , $body] = http('GET', "{$base}/admin/reservas/{$sickId}/comprobante", ['cookie' => 'casa_session=' . bin2hex(random_bytes(16))]);
check($code === 307 && $body === '', 'receipt with a forged session id -> 307, empty body');
[, $h] = http('GET', "{$base}/");
$visitor = explode(';', ($h['set-cookie'] ?? ['casa_session=x'])[0])[0];
[$code] = http('GET', "{$base}/admin/reservas/{$sickId}/comprobante", ['cookie' => $visitor]);
check($code === 307, 'receipt with a plain visitor session (no login) -> 307');
foreach (['/storage/receipts/' . $imgRel, '/receipts/' . $imgRel, '/../storage/receipts/' . $imgRel, '/uploads/' . $imgRel] as $guess) {
    [$code, , $body] = http('GET', $base . $guess);
    check($code === 404 && !str_contains($body, substr($jpgBytes, 0, 64)), "guessing {$guess} -> 404");
}
[$code] = http('POST', "{$base}/admin/reservas/{$noReceipt}/aprobar", ['body' => '']);
check($code === 307 && $status($noReceipt) === 'pending_review', 'approve POST without a session -> 307, nothing changes');

[, $h, $html] = http('GET', "{$base}/admin/login");
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
$cookie = explode(';', ($h['set-cookie'] ?? [''])[count($h['set-cookie'] ?? ['']) - 1])[0];
[, $h] = http('POST', "{$base}/admin/login", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $m[1], 'username' => 'duena', 'password' => $password])]);
foreach ($h['set-cookie'] ?? [] as $c) {
    $cookie = explode(';', $c)[0];
}

[$code, $h, $html] = http('GET', "{$base}/admin/reservas", ['cookie' => $cookie]);
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
check($code === 200 && str_contains($html, 'Aprobar confirma el pago y mantiene el lugar ocupado; rechazar lo libera solo.') && str_contains($html, 'Todos los estados'), 'logged in: the list renders with the original texts');
check(!str_contains($html, 'CONDICION-SECRETA') && !str_contains($html, 'Asma') && !str_contains($html, 'TOKEN-SECRETO'), 'the list HTML shows no health condition and no token');
check(str_contains($html, 'salud@example.com') && str_contains($html, 'con comprobante') && str_contains($html, 'sin comprobante'), 'it shows customer contact and receipt presence');
[$code, , $html] = http('GET', "{$base}/admin/reservas?status=expired&eventId={$other}", ['cookie' => $cookie]);
check($code === 200 && str_contains($html, 'vencida@example.com') && !str_contains($html, 'salud@example.com') && str_contains($html, '>Expirada<') && str_contains($html, 'Limpiar'), 'HTTP filter ?status=expired: only the lapsed hold, badge "Expirada", "Limpiar" shown');
[$code, , $html] = http('GET', "{$base}/admin/reservas?status=nada&eventId=nada", ['cookie' => $cookie]);
check($code === 200 && str_contains($html, 'salud@example.com') && !str_contains($html, 'Limpiar'), 'garbage filters -> full list, never a 500');
[$code, , $html] = http('GET', "{$base}/admin/reservas?status[]=approved", ['cookie' => $cookie]);
check($code === 200, 'array filter in the URL -> 200');

[$code, $h, $html] = http('GET', "{$base}/admin/reservas/{$sickId}", ['cookie' => $cookie]);
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
$csrf = $m[1] ?? '';
check($code === 200 && str_contains($html, 'CONDICION-SECRETA') && str_contains($html, 'Ley 25.326'), 'the detail (admin only) shows the health condition with the Ley 25.326 note');
check(str_contains($html, 'Titular Prueba') && str_contains($html, "\$\u{00A0}15.000,00") && str_contains($html, '17 de octubre de 2026') && str_contains($html, 'OP-123'), 'declared transfer data rendered (holder, $ 15.000,00, date, operation number)');
check(str_contains($html, "src=\"/admin/reservas/{$sickId}/comprobante\"") && str_contains($html, 'Abrir en una pestaña nueva'), 'image receipt embedded through the admin-only URL');
check(str_contains($html, 'Aprobar reserva') && str_contains($html, 'Rechazar reserva') && str_contains($html, 'Motivo del rechazo (opcional)'), 'pending_review: both actions offered');
check(in_array('no-store', $h['cache-control'] ?? [], true), 'detail page is no-store');

[$code, $h, $body] = http('GET', "{$base}/admin/reservas/{$sickId}/comprobante", ['cookie' => $cookie]);
check($code === 200 && $body === $jpgBytes, 'with the admin session the receipt streams byte for byte');
check(($h['content-type'][0] ?? '') === 'image/webp' && ($h['x-content-type-options'][0] ?? '') === 'nosniff' && str_contains($h['cache-control'][0] ?? '', 'no-store') && str_starts_with($h['content-disposition'][0] ?? '', 'inline'), 'Content-Type from the stored mime, nosniff, no-store, inline');
[$code, $h, $body] = http('GET', "{$base}/admin/reservas/{$pdfRes}/comprobante", ['cookie' => $cookie]);
check($code === 200 && $body === $pdfBytes && ($h['content-type'][0] ?? '') === 'application/pdf', 'PDF receipt streams as application/pdf');
[, , $html] = http('GET', "{$base}/admin/reservas/{$pdfRes}", ['cookie' => $cookie]);
check(str_contains($html, 'Abrir el PDF en una pestaña nueva') && str_contains($html, 'El comprobante es un PDF') && !str_contains($html, '<img src="/admin/reservas/'), 'PDF detail: open button, no <img>');
[$code] = http('GET', "{$base}/admin/reservas/{$noReceipt}/comprobante", ['cookie' => $cookie]);
[, , $html] = http('GET', "{$base}/admin/reservas/{$noReceipt}", ['cookie' => $cookie]);
check($code === 404 && str_contains($html, 'Todavía no hay comprobante cargado para esta reserva.'), 'no receipt: 404 on the file URL, explanatory text on the detail');
$pdo->prepare('UPDATE reservations SET receipt_path = ? WHERE id = ?')->execute(['../../config/config.php', $noReceipt]);
[$code, , $body] = http('GET', "{$base}/admin/reservas/{$noReceipt}/comprobante", ['cookie' => $cookie]);
check($code === 404 && !str_contains($body, 'password'), 'a tampered receipt_path pointing outside storage -> 404');
foreach (['/admin/reservas/no-es-uuid', '/admin/reservas/' . t_uuid(), '/admin/reservas/no-es-uuid/comprobante'] as $path) {
    [$code] = http('GET', $base . $path, ['cookie' => $cookie]);
    check($code === 404, "{$path} -> 404");
}

echo "\nApprove / reject over HTTP:\n";
[$code] = http('POST', "{$base}/admin/reservas/{$sickId}/aprobar", ['cookie' => $cookie, 'body' => '']);
check($code === 403 && $status($sickId) === 'pending_review', 'approve without the CSRF token -> 403, nothing changes');
[$code] = http('POST', "{$base}/admin/reservas/{$sickId}/rechazar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => 'f00', 'rejectionReason' => 'x'])]);
check($code === 403 && $status($sickId) === 'pending_review', 'reject with a wrong CSRF token -> 403, nothing changes');
[$code, , $html] = http('POST', "{$base}/admin/reservas/{$sickId}/rechazar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf, 'rejectionReason' => str_repeat('a', 501)])]);
check($code === 422 && str_contains($html, 'El motivo no puede superar los 500 caracteres') && $status($sickId) === 'pending_review', 'reason of 501 characters -> 422 with the message, nothing changes');
$seatsBefore = EventsAdmin::find($other)['occupied'];
[$code, $h] = http('POST', "{$base}/admin/reservas/{$sickId}/rechazar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf, 'rejectionReason' => '  Monto distinto  '])]);
check($code === 303 && ($h['location'][0] ?? '') === "/admin/reservas/{$sickId}" && $status($sickId) === 'rejected', 'reject -> 303 back to the detail, status rejected');
check(EventsAdmin::find($other)['occupied'] === $seatsBefore - 1, 'and the event has exactly one seat more');
[, , $html] = http('GET', "{$base}/admin/reservas/{$sickId}", ['cookie' => $cookie]);
check(str_contains($html, 'Motivo del rechazo: Monto distinto') && str_contains($html, 'Solo las reservas en revisión se pueden aprobar o rechazar.') && !str_contains($html, 'Aprobar reserva'), 'detail now shows the reason and no actions');
[$code, , $html] = http('POST', "{$base}/admin/reservas/{$sickId}/rechazar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf])]);
check($code === 409 && str_contains($html, 'La reserva ya no está pendiente de revisión.'), 'rejecting again -> 409 with the original message');
[$code, $h] = http('POST', "{$base}/admin/reservas/{$sickId}/aprobar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf])]);
check($code === 303 && ($h['location'][0] ?? '') === "/admin/reservas/{$sickId}?error=not_pending" && $status($sickId) === 'rejected', 'approving a rejected one -> ?error=not_pending, stays rejected');
[, , $html] = http('GET', "{$base}/admin/reservas/{$sickId}?error=not_pending", ['cookie' => $cookie]);
check(str_contains($html, 'No pudimos aplicar el cambio: la reserva ya no está pendiente de revisión.'), 'which shows the original notice');
$seatsBefore = EventsAdmin::find($other)['occupied'];
[$code, $h] = http('POST', "{$base}/admin/reservas/{$pdfRes}/aprobar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf])]);
check($code === 303 && $status($pdfRes) === 'approved' && EventsAdmin::find($other)['occupied'] === $seatsBefore, 'approve over HTTP -> approved, seat count unchanged');
[$code, , $body] = http('POST', "{$base}/admin/reservas/{$pdfRes}/aprobar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf])]);
check($code === 303, 'second approve (double click) -> harmless redirect');
[$code] = http('POST', "{$base}/admin/reservas/no-es-uuid/rechazar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf])]);
check($code === 404, 'reject on a malformed id -> 404');

finish();
