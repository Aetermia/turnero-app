<?php
/*
 * Single entry point. The .htaccess next to this file sends every request that
 * is not a real file (CSS, images, fonts) here.
 *
 * On DonWeb this file lives in public_html, and app/, config/ and storage/ live
 * one level above it, outside the web root: that is what keeps receipts and
 * credentials unreachable by URL.
 */

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

set_exception_handler(static function (Throwable $error): void {
    error_log((string) $error);
    if ($error instanceof DatabaseNotConfigured) {
        if (!headers_sent()) {
            http_response_code(503);
            header('Content-Type: text/html; charset=utf-8');
        }
        echo render('errors/503', ['title' => 'Volvemos en un rato']);
        return;
    }
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/html; charset=utf-8');
    }
    try {
        echo render('errors/500', ['title' => 'Algo salió mal']);
    } catch (Throwable) {
        echo 'Algo salió mal. Probá de nuevo en unos minutos.';
    }
});

// Baseline security headers for every page.
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: DENY');

/** @var Router $router */
$router = require APP_DIR . '/routes.php';
$router->dispatch(request_method(), request_path());
