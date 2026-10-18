<?php

declare(strict_types=1);

/** Escapes text for HTML output. Every value printed in a view goes through it. */
function e(string|int|float|null $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Renders a view inside the site layout and returns the HTML.
 *
 * @param array<string, mixed> $data
 */
function render(string $view, array $data = [], ?string $layout = 'layout'): string
{
    $content = render_partial($view, $data);
    if ($layout === null) {
        return $content;
    }
    return render_partial($layout, $data + ['content' => $content]);
}

/** @param array<string, mixed> $data */
function render_partial(string $view, array $data = []): string
{
    $file = APP_DIR . '/views/' . $view . '.php';
    if (!is_file($file)) {
        throw new RuntimeException("View not found: {$view}");
    }
    extract($data, EXTR_SKIP);
    ob_start();
    try {
        require $file;
        return (string) ob_get_clean();
    } catch (Throwable $error) {
        ob_end_clean();
        throw $error;
    }
}

/**
 * Sends a full HTML response.
 *
 * @param array<string, mixed> $data
 */
function respond(string $view, array $data = [], int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo render($view, $data);
}

/**
 * Redirects after a POST (303) or for a navigation guard (302). `exit` keeps
 * the rest of the handler from running once the response is decided.
 */
function redirect(string $location, int $status = 303): never
{
    header('Location: ' . $location, true, $status);
    exit;
}

function not_found(): never
{
    respond('errors/404', ['title' => 'Página no encontrada', 'noindex' => true], 404);
    exit;
}

/** The request path without the query string, e.g. "/eventos/abc". */
function request_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $path = is_string($path) ? rawurldecode($path) : '/';
    $path = '/' . trim($path, '/');
    return $path;
}

function request_method(): string
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    return $method === 'HEAD' ? 'GET' : $method;
}

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    // Shared hosts often terminate TLS in a proxy in front of PHP.
    return ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

/** A trimmed string from POST data, or null when the field is missing. */
function post_string(string $key): ?string
{
    $value = $_POST[$key] ?? null;
    return is_string($value) ? trim($value) : null;
}

/** A trimmed string from the query string, or null when it is missing. */
function query_string(string $key): ?string
{
    $value = $_GET[$key] ?? null;
    return is_string($value) ? trim($value) : null;
}

/** RFC 4122 version 4 UUID, used as primary key for every table. */
function uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12),
    );
}

function is_uuid(string $value): bool
{
    return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $value);
}
