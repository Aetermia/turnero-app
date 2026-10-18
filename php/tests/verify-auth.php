<?php
/*
 * P7 — admin access, measured over real HTTP (same matrix as T7 in the
 * Next.js version, plus PHP-specific checks):
 *   /admin/login without session -> 200 (no redirect loop)
 *   /admin without session -> 307 to /admin/login
 *   wrong password -> 303 ?error=credentials and still no access
 *   right password -> 303 /admin, new session id, cookie HttpOnly + SameSite
 *     + 7 days; Secure in production
 *   valid cookie -> 200; forged / expired / logged-out cookie -> 307
 *   no hash or an invalid hash in config -> nobody gets in (fails closed)
 *
 * Run: php tests/verify-auth.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

reset_test_database();
$password = 'una-clave-de-prueba-larga';
$hash = password_hash($password, PASSWORD_DEFAULT);
$base = start_test_server(write_test_config(['admin' => ['user' => 'duena', 'password_hash' => $hash]]));

function cookie_from(array $headers): array
{
    $cookie = '';
    $raw = '';
    foreach ($headers['set-cookie'] ?? [] as $c) {
        $cookie = explode(';', $c)[0];
        $raw = $c;
    }
    return [$cookie, $raw];
}

function login_form(string $base, string $cookie = ''): array
{
    [$status, $headers, $html] = http('GET', "{$base}/admin/login", $cookie !== '' ? ['cookie' => $cookie] : []);
    [$newCookie] = cookie_from($headers);
    preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
    return [$status, $newCookie !== '' ? $newCookie : $cookie, $m[1] ?? '', $html];
}

function post_login(string $base, string $cookie, string $csrf, string $user, string $pass): array
{
    return http('POST', "{$base}/admin/login", [
        'cookie' => $cookie,
        'body' => http_build_query(['_csrf' => $csrf, 'username' => $user, 'password' => $pass]),
    ]);
}

echo "Without a session:\n";
[$status, $cookie, $csrf, $html] = login_form($base);
check($status === 200 && str_contains($html, 'Panel de administración') && str_contains($html, 'Ingresar'), '/admin/login answers 200 (no redirect loop)');
[$status, $headers] = http('GET', "{$base}/admin");
check($status === 307 && ($headers['location'][0] ?? '') === '/admin/login', '/admin answers 307 to /admin/login');
[$status, , $body] = http('GET', "{$base}/admin");
check(!str_contains($body, 'Gestionar eventos'), 'and leaks no panel content');

echo "\nWrong credentials:\n";
[$status] = http('POST', "{$base}/admin/login", ['cookie' => $cookie, 'body' => http_build_query(['username' => 'duena', 'password' => $password])]);
check($status === 403, 'a login POST without the CSRF token is rejected (403)');
[$status, $headers] = post_login($base, $cookie, $csrf, 'duena', 'clave-equivocada');
check($status === 303 && ($headers['location'][0] ?? '') === '/admin/login?error=credentials', 'wrong password -> 303 to ?error=credentials');
[$status] = http('GET', "{$base}/admin", ['cookie' => $cookie]);
check($status === 307, 'and the cookie still does not open the panel');
[$status, $headers] = post_login($base, $cookie, $csrf, 'otra-persona', $password);
check(($headers['location'][0] ?? '') === '/admin/login?error=credentials', 'right password with the wrong user -> also rejected');
[, , , $html] = login_form($base, $cookie);
[$status, , $html] = http('GET', "{$base}/admin/login?error=credentials", ['cookie' => $cookie]);
check(str_contains($html, 'Usuario o contraseña incorrectos.'), 'the login page shows "Usuario o contraseña incorrectos."');

echo "\nRight credentials:\n";
$sessionBefore = $cookie;
[$status, $headers] = post_login($base, $cookie, $csrf, 'duena', $password);
[$adminCookie, $raw] = cookie_from($headers);
check($status === 303 && ($headers['location'][0] ?? '') === '/admin', 'right password -> 303 to /admin');
check($adminCookie !== '' && $adminCookie !== $sessionBefore, 'the session id changes on login (no session fixation)');
check(stripos($raw, 'HttpOnly') !== false && stripos($raw, 'SameSite=Lax') !== false, 'the cookie is HttpOnly and SameSite=Lax');
preg_match('/Max-Age=(\d+)/i', $raw, $m);
check(isset($m[1]) && abs((int) $m[1] - 604800) <= 5, 'the cookie lasts 7 days (Max-Age=' . ($m[1] ?? '?') . ', like the Next.js version)');
[$status, , $body] = http('GET', "{$base}/admin", ['cookie' => $adminCookie]);
check($status === 200 && str_contains($body, 'Sesión de duena') && str_contains($body, 'Gestionar reservas'), 'with that cookie /admin answers 200 and shows the dashboard');
check(str_contains($body, 'noindex'), 'panel pages are noindex');
check(!str_contains($body, '← Volver al panel'), 'the dashboard hides "Volver al panel"');
[$status, $headers] = http('GET', "{$base}/admin/login", ['cookie' => $adminCookie]);
check($status === 302 && ($headers['location'][0] ?? '') === '/admin', 'an admin who opens /admin/login is sent to the panel');
[$status] = http('GET', "{$base}/admin", ['cookie' => $sessionBefore]);
check($status === 307, 'the PRE-login session id does not open the panel');

echo "\nForged and expired cookies:\n";
[$status] = http('GET', "{$base}/admin", ['cookie' => 'casa_session=' . bin2hex(random_bytes(16))]);
check($status === 307, 'a made-up session id -> 307');
$tampered = substr($adminCookie, 0, -1) . (substr($adminCookie, -1) === 'a' ? 'b' : 'a');
[$status] = http('GET', "{$base}/admin", ['cookie' => $tampered]);
check($status === 307, 'a session id with one character changed -> 307');
$sessionFile = STORAGE_DIR . '/sessions/sess_' . explode('=', $adminCookie, 2)[1];
$contents = (string) @file_get_contents($sessionFile);
check(str_contains($contents, 'admin_user|s:5:"duena"'), 'the session lives in storage/sessions (outside public_html)');
file_put_contents($sessionFile, (string) preg_replace('/admin_expires\|i:\d+;/', 'admin_expires|i:' . (time() - 1) . ';', $contents));
[$status] = http('GET', "{$base}/admin", ['cookie' => $adminCookie]);
check($status === 307, 'an EXPIRED admin session -> 307');

echo "\nLogout:\n";
[, $cookie2, $csrf2] = login_form($base);
[, $headers] = post_login($base, $cookie2, $csrf2, 'duena', $password);
[$admin2] = cookie_from($headers);
[, , $panel] = http('GET', "{$base}/admin", ['cookie' => $admin2]);
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $panel, $m);
[$status] = http('POST', "{$base}/admin/logout", ['cookie' => $admin2, 'body' => '']);
check($status === 403, 'logout without the CSRF token is rejected (403)');
[$status, $headers] = http('POST', "{$base}/admin/logout", ['cookie' => $admin2, 'body' => http_build_query(['_csrf' => $m[1] ?? ''])]);
check($status === 303 && ($headers['location'][0] ?? '') === '/admin/login', 'logout -> 303 to /admin/login');
[$status] = http('GET', "{$base}/admin", ['cookie' => $admin2]);
check($status === 307, 'the old cookie no longer opens the panel');

echo "\nFails closed:\n";
foreach (['empty hash' => '', 'invalid hash' => 'no-es-un-hash', 'plain-text password as hash' => $password] as $label => $badHash) {
    $closed = start_test_server(write_test_config(['admin' => ['user' => 'duena', 'password_hash' => $badHash]]));
    [, $c, $t] = login_form($closed);
    [$status, $headers] = post_login($closed, $c, $t, 'duena', $password);
    [$cc] = cookie_from($headers);
    [$panelStatus] = http('GET', "{$closed}/admin", ['cookie' => $cc !== '' ? $cc : $c]);
    check(($headers['location'][0] ?? '') === '/admin/login?error=config' && $panelStatus === 307, "{$label}: login says ?error=config and the panel stays closed");
}
$closed = start_test_server(write_test_config(['admin' => ['user' => '', 'password_hash' => $hash]]));
[, $c, $t] = login_form($closed);
[, $headers] = post_login($closed, $c, $t, '', $password);
check(($headers['location'][0] ?? '') === '/admin/login?error=config', 'an empty admin user also fails closed');
[, , $html] = http('GET', "{$closed}/admin/login?error=config");
check(str_contains($html, 'todavía no está configurado'), 'the login page explains the panel is not configured');

echo "\nProduction cookie flags:\n";
$prod = start_test_server(write_test_config(['env' => 'production', 'admin' => ['user' => 'duena', 'password_hash' => $hash]]));
[, $headers] = http('GET', "{$prod}/admin/login");
[, $raw] = cookie_from($headers);
check(stripos($raw, 'secure') !== false, 'with env=production the session cookie is Secure');
[$status, , $body] = http('GET', "{$prod}/no-existe");
check($status === 404 && !str_contains($body, 'Stack trace') && !str_contains($body, '.php'), 'production pages never show stack traces or file paths');

finish();
