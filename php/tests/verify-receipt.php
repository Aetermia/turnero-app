<?php
/*
 * P6 — receipt upload and payment confirmation, over real HTTP and in a real
 * browser, against a real database:
 *   - the file lands OUTSIDE public/ and no URL serves it (R2)
 *   - the type is checked by content: a renamed text or PHP file is refused
 *   - 8 MB limit, and a body over post_max_size gets a clear message
 *   - CSRF on both steps; expired holds cannot attach or confirm
 *   - the declared amount must match the price (integer cents, no float)
 *   - confirming moves to pending_review and clears the deadline
 *   - R4 in Chromium: a big photo is compressed to JPEG <= 1600 px before
 *     upload, a PDF goes byte for byte, and a dropped connection shows
 *     "Reintentar", which then works
 *
 * Run: php tests/verify-receipt.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));
$base = start_test_server(write_test_config(), 0, ['upload_max_filesize' => '16M', 'post_max_size' => '16M']);
$work = sys_get_temp_dir() . '/casa-receipt-test-' . getmypid();
@mkdir($work);
$createdReservations = [];
register_shutdown_function(static function () use (&$createdReservations, $work): void {
    foreach ($createdReservations as $id) {
        array_map('unlink', glob(Receipts::directory() . "/{$id}/*") ?: []);
        @rmdir(Receipts::directory() . "/{$id}");
    }
    array_map('unlink', glob("{$work}/*") ?: []);
    @rmdir($work);
});

$event = t_event($pdo, ['title' => 'Taller con comprobante', 'capacity' => 10, 'price' => '15000.00']);
function book(string $eventId, string $email): array
{
    global $createdReservations;
    $result = Reservations::create($eventId, ['full_name' => 'Ana', 'email' => $email, 'whatsapp' => '2494000000',
        'has_condition' => true, 'condition_details' => 'DATO-DE-SALUD-SECRETO', 'marketing_consent' => false]);
    $row = Db::one('SELECT id FROM reservations WHERE public_token = ?', [$result['token']]);
    $createdReservations[] = $row['id'];
    return ['token' => $result['token'], 'id' => $row['id']];
}

/** GET the page and return [cookie, csrf, html]. */
function session_for(string $base, string $token): array
{
    [, $headers, $html] = http('GET', "{$base}/reservas/{$token}");
    $cookie = '';
    foreach ($headers['set-cookie'] ?? [] as $c) {
        $cookie = explode(';', $c)[0];
    }
    preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
    return [$cookie, $m[1] ?? '', $html];
}

function upload(string $base, string $token, string $cookie, string $csrf, string $path, string $name, string $type, bool $json = true): array
{
    $fields = ['receipt' => new CURLFile($path, $type, $name)];
    if ($csrf !== '') {
        $fields['_csrf'] = $csrf;
    }
    $headers = $json ? ['Accept: application/json'] : [];
    return http('POST', "{$base}/reservas/{$token}/comprobante", ['body' => $fields, 'cookie' => $cookie, 'headers' => $headers]);
}

// Test files.
$jpeg = "{$work}/foto.jpg";
$img = imagecreatetruecolor(800, 600);
imagefilledrectangle($img, 0, 0, 800, 600, imagecolorallocate($img, 200, 180, 160));
imagejpeg($img, $jpeg, 85);
$pdf = "{$work}/comprobante.pdf";
file_put_contents($pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
$fakeJpg = "{$work}/no-soy-foto.jpg";
file_put_contents($fakeJpg, "esto es texto plano, no una imagen\n");
$phpFile = "{$work}/shell.jpg";
file_put_contents($phpFile, "<?php echo 'pwned'; ?>\n");
$big = "{$work}/grande.pdf";
file_put_contents($big, "%PDF-1.4\n" . str_repeat('0', 9 * 1024 * 1024));

echo "Payment step page:\n";
$a = book($event, 'ana@example.com');
[$cookie, $csrf, $html] = session_for($base, $a['token']);
check(str_contains($html, 'Te guardamos el lugar') && str_contains($html, 'Cómo pagar'), 'a live hold shows "Te guardamos el lugar" and "Cómo pagar"');
check(str_contains($html, 'alias.de.prueba'), 'the payment alias from config.php is shown');
check(str_contains($html, 'Subir comprobante') && !str_contains($html, 'Confirmar reserva'), 'before the receipt: upload form only, no transfer form');
check(!str_contains($html, 'DATO-DE-SALUD-SECRETO'), 'the health condition never appears on the public page');

echo "\nUpload (R2, type by content, limits):\n";
[$status] = upload($base, $a['token'], $cookie, '', $jpeg, 'foto.jpg', 'image/jpeg');
check($status === 403, 'an upload without the CSRF token is rejected (403)');
[$status, , $body] = upload($base, $a['token'], $cookie, $csrf, $fakeJpg, 'no-soy-foto.jpg', 'image/jpeg');
check($status === 422 && str_contains($body, 'Formato no soportado'), 'a text file renamed .jpg is refused by its content');
[$status, , $body] = upload($base, $a['token'], $cookie, $csrf, $phpFile, 'shell.jpg', 'image/jpeg');
check($status === 422 && str_contains($body, 'Formato no soportado'), 'a PHP file disguised as .jpg is refused');
[$status, , $body] = upload($base, $a['token'], $cookie, $csrf, $big, 'grande.pdf', 'application/pdf');
check($status === 422 && str_contains($body, 'El archivo supera los 8MB'), 'a 9 MB file is refused: "El archivo supera los 8MB"');
check(glob(Receipts::directory() . "/{$a['id']}/*") === [], 'none of the refused files was stored');

[$status, , $body] = upload($base, $a['token'], $cookie, $csrf, $jpeg, 'foto.jpg', 'image/jpeg');
check($status === 200 && json_decode($body, true) === ['ok' => true], 'a real JPEG is accepted (200 {"ok":true})');
$row = Db::one('SELECT status, receipt_path, receipt_mime_type, receipt_uploaded_at FROM reservations WHERE id = ?', [$a['id']]);
$stored = Receipts::absolutePath((string) $row['receipt_path']);
check($stored !== null && str_starts_with($stored, realpath(TEST_ROOT . '/storage/receipts')), 'it is stored under storage/receipts, outside public/');
check(!str_contains((string) realpath((string) $stored), realpath(TEST_ROOT . '/public')), 'the stored path is not inside the web root');
check($row['receipt_mime_type'] === 'image/jpeg' && $row['status'] === 'pending_no_receipt', 'type recorded from content; status still pending_no_receipt');
$publicGuesses = ['/storage/receipts/' . $row['receipt_path'], '/receipts/' . $row['receipt_path'], '/' . $row['receipt_path'], '/uploads/' . $row['receipt_path'], '/../storage/receipts/' . $row['receipt_path']];
$leaks = array_filter($publicGuesses, static fn (string $p): bool => http('GET', $base . $p)[2] === file_get_contents((string) $stored));
check($leaks === [], 'no public URL serves the receipt (' . count($publicGuesses) . ' guesses tried)');

[, , $html] = http('GET', "{$base}/reservas/{$a['token']}", ['cookie' => $cookie]);
check(str_contains($html, 'Comprobante cargado') && str_contains($html, 'Confirmar reserva'), 'after the upload the page shows "Comprobante cargado" and the transfer form');
check(str_contains($html, 'value="15000.00"') && str_contains($html, 'Total a pagar: 15000.00'), 'the amount field is prefilled with the price');

$firstFile = (string) $stored;
[$status] = upload($base, $a['token'], $cookie, $csrf, $pdf, 'comprobante.pdf', 'application/pdf');
$row = Db::one('SELECT receipt_path, receipt_mime_type FROM reservations WHERE id = ?', [$a['id']]);
$pdfStored = Receipts::absolutePath((string) $row['receipt_path']);
check($status === 200 && $row['receipt_mime_type'] === 'application/pdf', 'a PDF replaces it while the hold is pending');
check(!is_file($firstFile) && count(glob(Receipts::directory() . "/{$a['id']}/*")) === 1, 'the replaced file is deleted (only one file left)');
check(hash_file('sha256', (string) $pdfStored) === hash_file('sha256', $pdf), 'the PDF is stored byte for byte');

echo "\nUpload without JavaScript (plain form):\n";
$n = book($event, 'nojs@example.com');
[$ncookie, $ncsrf] = session_for($base, $n['token']);
[$status, $headers] = upload($base, $n['token'], $ncookie, $ncsrf, $fakeJpg, 'x.jpg', 'image/jpeg', false);
check($status === 303 && ($headers['location'][0] ?? '') === "/reservas/{$n['token']}", 'it redirects back to the page (303)');
[, , $html] = http('GET', "{$base}/reservas/{$n['token']}", ['cookie' => $ncookie]);
check(str_contains($html, 'Formato no soportado') && str_contains($html, '>Reintentar<'), 'the error is shown with a "Reintentar" button');

echo "\nBody over post_max_size:\n";
$small = start_test_server(write_test_config(), 0, ['upload_max_filesize' => '1M', 'post_max_size' => '1M']);
$m = book($event, 'postmax@example.com');
[$mcookie, $mcsrf] = session_for($small, $m['token']);
[$status, , $body] = upload($small, $m['token'], $mcookie, $mcsrf, $big, 'grande.pdf', 'application/pdf');
check($status === 413 && str_contains($body, 'El archivo supera los 8MB'), 'it answers "El archivo supera los 8MB", not a CSRF error');

echo "\nConfirming the transfer:\n";
[$status] = http('POST', "{$base}/reservas/{$a['token']}/confirmar", ['body' => http_build_query(['transferHolder' => 'Ana']), 'cookie' => $cookie]);
check($status === 403, 'without the CSRF token it is rejected (403)');
[$status, , $html] = http('POST', "{$base}/reservas/{$a['token']}/confirmar", ['body' => http_build_query(['_csrf' => $csrf, 'transferAmount' => '15.000', 'transferDate' => '2026-02-30']), 'cookie' => $cookie]);
check($status === 422, 'invalid data answers 422');
foreach (['Ingresá el titular de la transferencia', 'Formato de monto inválido (ej. 15000 o 15000.50)', 'Ingresá una fecha válida', 'Ingresá el número de operación'] as $msg) {
    check(str_contains($html, $msg), "shows: \"{$msg}\"");
}
$valid = ['_csrf' => $csrf, 'transferHolder' => 'Ana Pérez', 'transferDate' => '2026-10-18', 'transferReference' => 'OP-123'];
[$status, , $html] = http('POST', "{$base}/reservas/{$a['token']}/confirmar", ['body' => http_build_query($valid + ['transferAmount' => '14000']), 'cookie' => $cookie]);
check($status === 422 && str_contains($html, 'El monto declarado ($14000.00) no coincide con el total del evento ($15000.00). Verificá el monto transferido.'),
    'a different amount shows the original mismatch message, with the same numbers');
[$status, $headers] = http('POST', "{$base}/reservas/{$a['token']}/confirmar", ['body' => http_build_query($valid + ['transferAmount' => '15000,00']), 'cookie' => $cookie]);
check($status === 303, 'the right amount (written with a comma) is accepted (303)');
$row = Db::one('SELECT status, expires_at, transfer_holder, transfer_amount, transfer_date, transfer_reference FROM reservations WHERE id = ?', [$a['id']]);
check($row['status'] === 'pending_review' && $row['expires_at'] === null, 'status is pending_review and the deadline is cleared (it never expires now)');
check($row['transfer_holder'] === 'Ana Pérez' && $row['transfer_amount'] === '15000.00' && $row['transfer_date'] === '2026-10-18' && $row['transfer_reference'] === 'OP-123', 'the declared transfer data is stored');
[, , $html] = http('GET', "{$base}/reservas/{$a['token']}", ['cookie' => $cookie]);
check(str_contains($html, 'Tu reserva está en revisión') && str_contains($html, 'Datos enviados') && str_contains($html, 'OP-123'), 'the page now reads "Tu reserva está en revisión" with the data sent');
check(!str_contains($html, 'DATO-DE-SALUD-SECRETO') && !str_contains($html, 'Subir comprobante'), 'no upload form anymore, and still no health data');
[, , $body] = upload($base, $a['token'], $cookie, $csrf, $jpeg, 'foto.jpg', 'image/jpeg');
check(str_contains($body, 'No es posible subir el comprobante en el estado actual'), 'a receipt can no longer be uploaded once in review');

$b = book($event, 'sincomprobante@example.com');
[$bcookie, $bcsrf] = session_for($base, $b['token']);
[, , $html] = http('POST', "{$base}/reservas/{$b['token']}/confirmar", ['body' => http_build_query(['_csrf' => $bcsrf, 'transferAmount' => '15000'] + $valid), 'cookie' => $bcookie]);
check(str_contains($html, 'Falta el comprobante subido'), 'confirming without a receipt says "Falta el comprobante subido"');

echo "\nExpired hold:\n";
$c = book($event, 'vencida@example.com');
[$ccookie, $ccsrf] = session_for($base, $c['token']);
upload($base, $c['token'], $ccookie, $ccsrf, $jpeg, 'foto.jpg', 'image/jpeg');
Db::run('UPDATE reservations SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [$c['id']]);
[, , $body] = upload($base, $c['token'], $ccookie, $ccsrf, $pdf, 'comprobante.pdf', 'application/pdf');
check(str_contains($body, 'La reserva ya expiró. No es posible completar el pago'), 'an expired hold cannot attach a receipt');
[, , $html] = http('POST', "{$base}/reservas/{$c['token']}/confirmar", ['body' => http_build_query(['_csrf' => $ccsrf, 'transferAmount' => '15000'] + $valid), 'cookie' => $ccookie]);
check(str_contains($html, 'El plazo venció') && Db::one('SELECT status FROM reservations WHERE id = ?', [$c['id']])['status'] === 'pending_no_receipt',
    'an expired hold cannot be confirmed (the page now reads "El plazo venció")');

echo "\nR4 in a real browser (Chromium):\n";
$d = book($event, 'navegador@example.com');
$e = book($event, 'navegadorpdf@example.com');
// A camera-like shot: 4000x3000 JPEG at high quality, with noise so it
// does not compress to nothing (a few MB, under the 8 MB limit).
$photo = "{$work}/camara.jpg";
$big = imagecreatetruecolor(4000, 3000);
for ($y = 0; $y < 3000; $y += 12) {
    for ($x = 0; $x < 4000; $x += 12) {
        imagefilledrectangle($big, $x, $y, $x + 11, $y + 11, imagecolorallocate($big, random_int(0, 255), random_int(0, 255), random_int(0, 255)));
    }
}
imagejpeg($big, $photo, 92);
$photoBytes = filesize($photo);
$script = __DIR__ . '/browser/receipt-browser.cjs';
$out = shell_exec('node ' . implode(' ', array_map('escapeshellarg', [$script, $base, $d['token'], $e['token'], $photo, $pdf])) . ' 2>&1');
$browser = json_decode((string) $out, true);
if (!is_array($browser) || isset($browser['error'])) {
    echo "        browser output: {$out}\n";
    $browser = is_array($browser) ? $browser : [];
}
check(($browser['disabledWhilePreparing'] ?? false) === true, 'while the photo is being compressed the button is disabled ("Preparando...")');
check(($browser['retryShown'] ?? false) === true, 'with the connection cut, the page shows the error and a visible "Reintentar" button');
check(str_contains((string) ($browser['retryMessage'] ?? ''), 'Revisá tu conexión'), 'the message tells the person to check their connection');
check(($browser['afterRetry'] ?? false) === true, 'tapping "Reintentar" with the connection back uploads it and shows the transfer form');
$row = Db::one('SELECT receipt_path, receipt_mime_type FROM reservations WHERE id = ?', [$d['id']]);
$storedPhoto = Receipts::absolutePath((string) $row['receipt_path']);
$size = $storedPhoto ? getimagesize($storedPhoto) : false;
check($row['receipt_mime_type'] === 'image/jpeg' && $size !== false && max($size[0], $size[1]) === 1600,
    'a 4000x3000 camera photo was compressed in the browser to a ' . ($size ? "{$size[0]}x{$size[1]}" : '?') . ' JPEG');
check($storedPhoto && filesize($storedPhoto) < $photoBytes / 2, sprintf('it went from %.1f MB to %.0f KB', $photoBytes / 1048576, $storedPhoto ? filesize($storedPhoto) / 1024 : 0));
$row = Db::one('SELECT receipt_path FROM reservations WHERE id = ?', [$e['id']]);
$storedPdf = Receipts::absolutePath((string) $row['receipt_path']);
check($storedPdf && hash_file('sha256', $storedPdf) === hash_file('sha256', $pdf), 'a PDF chosen in the browser is uploaded byte for byte');

finish();
