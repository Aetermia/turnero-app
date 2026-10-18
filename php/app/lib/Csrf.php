<?php

declare(strict_types=1);

/*
 * Synchronizer-token CSRF protection. Every form prints Csrf::field() and every
 * POST handler calls Csrf::verifyOrFail() before touching data. The token is
 * per session and compared in constant time.
 */
final class Csrf
{
    private const KEY = '_csrf';
    public const FIELD = '_csrf';

    public static function token(): string
    {
        $token = Session::get(self::KEY);
        if (!is_string($token) || $token === '') {
            $token = bin2hex(random_bytes(32));
            Session::set(self::KEY, $token);
        }
        return $token;
    }

    public static function field(): string
    {
        return '<input type="hidden" name="' . self::FIELD . '" value="' . e(self::token()) . '">';
    }

    public static function isValid(?string $submitted): bool
    {
        $expected = Session::get(self::KEY);
        return is_string($expected) && $expected !== '' && is_string($submitted)
            && hash_equals($expected, $submitted);
    }

    /** Ends the request with 403 when the token is missing or wrong. */
    public static function verifyOrFail(): void
    {
        $submitted = $_POST[self::FIELD] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
        if (!self::isValid(is_string($submitted) ? $submitted : null)) {
            http_response_code(403);
            header('Content-Type: text/html; charset=utf-8');
            echo render('errors/csrf', ['title' => 'Sesión vencida']);
            exit;
        }
    }
}
