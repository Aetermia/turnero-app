<?php
/*
 * Only for local development with PHP's built-in server (never deployed):
 *   php -S localhost:8080 -t public tools/dev-router.php
 * It serves real files directly and sends everything else to index.php, which
 * is what public/.htaccess does on the hosting.
 */
// The folder given with -t (public/ here, public_html in an extracted package).
$public = rtrim($_SERVER['DOCUMENT_ROOT'] ?? (dirname(__DIR__) . '/public'), '/');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (is_string($path) && $path !== '/' && is_file($public . $path)) {
    return false;
}
require $public . '/index.php';
