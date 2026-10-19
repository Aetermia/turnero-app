<?php
/*
 * P13 — the DonWeb package works as uploaded. Builds the zip, extracts it to
 * a temporary "home folder", writes config/config.php there (no environment
 * variable: the real default path) and serves public_html exactly like the
 * hosting would:
 *   - no credentials, receipts, sessions, tests or node_modules inside
 *   - catalog, booking and the panel login work from the extracted copy
 *   - a receipt lands in storage/receipts of that copy, outside public_html,
 *     and no URL reaches storage, app or config
 *
 * Run: php tests/verify-deploy-package.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$home = sys_get_temp_dir() . '/casa-home-' . bin2hex(random_bytes(4));
$zipPath = "{$home}.zip";
register_shutdown_function(static function () use ($home, $zipPath): void {
    exec('rm -rf ' . escapeshellarg($home) . ' ' . escapeshellarg($zipPath));
});

exec('php ' . escapeshellarg(TEST_ROOT . '/tools/make-deploy-zip.php') . ' ' . escapeshellarg($zipPath), $output, $exit);
check($exit === 0 && is_file($zipPath), 'make-deploy-zip builds the package (' . implode(' ', $output) . ')');
$zip = new ZipArchive();
$zip->open($zipPath);
$names = [];
for ($i = 0; $i < $zip->numFiles; $i++) {
    $names[] = $zip->getNameIndex($i);
}
$zip->extractTo($home);
$zip->close();
$bad = preg_grep('#(^config/config\.php$|sess_|^storage/receipts/[0-9a-f]|node_modules|^tests/|\.log$|^public_html/uploads/events/[0-9a-f])#', $names);
check($bad === [], 'no config.php, sessions, receipts, logs, event photos, tests or node_modules in the zip');
check(in_array('public_html/index.php', $names, true) && in_array('public_html/.htaccess', $names, true) && in_array('app/bootstrap.php', $names, true)
    && in_array('storage/.htaccess', $names, true) && in_array('database/schema.sql', $names, true) && in_array('public_html/assets/app.css', $names, true),
    'it has public_html (index, .htaccess, compiled CSS), app, storage guard and schema.sql');
check(!array_filter($names, static fn (string $n): bool => str_starts_with($n, 'public_html/') && preg_match('#^public_html/(app|config|storage)/#', $n) === 1), 'nothing private sits inside public_html');

$s = test_db_settings();
$password = 'clave-del-panel-larga';
file_put_contents("{$home}/config/config.php", '<?php return ' . var_export([
    'env' => 'development',
    'db' => ['host' => $s['host'], 'port' => (int) $s['port'], 'name' => $s['name'], 'user' => $s['user'], 'password' => $s['password']],
    'payment_alias' => 'alias.del.paquete',
    'admin' => ['user' => 'duena', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)],
], true) . ';');
$port = random_int(40001, 50000);
$process = proc_open('exec php -S 127.0.0.1:' . $port . ' -t ' . escapeshellarg("{$home}/public_html") . ' ' . escapeshellarg(TEST_ROOT . '/tools/dev-router.php'),
    [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
register_shutdown_function(static fn () => proc_terminate($process));
$base = "http://127.0.0.1:{$port}";
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) {
    usleep(100_000);
}

$event = t_event($pdo, ['title' => 'Evento del paquete', 'capacity' => 3]);
[$code, , $html] = http('GET', "{$base}/");
check($code === 200 && str_contains($html, 'Evento del paquete') && !str_contains($html, 'Taller de acuarela') && str_contains($html, '/assets/app.css?v='), 'the extracted copy serves the catalog from ITS config (home/config/config.php -> test database), with its CSS');
[$code, $h, $html] = http('GET', "{$base}/eventos/{$event}/reservar");
$cookie = explode(';', ($h['set-cookie'] ?? [''])[0])[0];
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
[$code, $h] = http('POST', "{$base}/eventos/{$event}/reservar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $m[1] ?? '',
    'fullName' => 'Prueba Paquete', 'email' => 'paquete@example.com', 'whatsapp' => '2494000000', 'hasHealthCondition' => 'no'])]);
$statusPath = $h['location'][0] ?? '';
check($code === 303 && str_starts_with($statusPath, '/reservas/'), 'booking works');
check(count(glob("{$home}/storage/sessions/sess_*") ?: []) >= 1, 'sessions are written to home/storage/sessions (outside public_html)');
$jpeg = "{$home}/c.jpg";
$img = imagecreatetruecolor(300, 400);
imagejpeg($img, $jpeg, 80);
[, , $html] = http('GET', $base . $statusPath, ['cookie' => $cookie]);
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
[$code, , $body] = http('POST', "{$base}{$statusPath}/comprobante", ['cookie' => $cookie, 'headers' => ['Accept: application/json'],
    'body' => ['_csrf' => $m[1] ?? '', 'receipt' => new CURLFile($jpeg, 'image/jpeg', 'c.jpg')]]);
$stored = glob("{$home}/storage/receipts/*/*.jpg") ?: [];
check($code === 200 && count($stored) === 1, 'the receipt is stored in home/storage/receipts');
$rel = substr($stored[0] ?? '', strlen("{$home}/storage/receipts/"));
foreach (["/storage/receipts/{$rel}", "/../storage/receipts/{$rel}", '/config/config.php', '/../config/config.php', '/app/bootstrap.php', '/database/schema.sql'] as $path) {
    [$code, , $body] = http('GET', $base . $path);
    check($code === 404 && !str_contains($body, 'password') && !str_contains($body, 'CREATE TABLE'), "{$path} -> 404 (not reachable by URL)");
}
[$code, , $html] = http('GET', "{$base}/admin/login");
check($code === 200 && str_contains($html, 'Ingresar'), 'the panel login is up');

finish();
