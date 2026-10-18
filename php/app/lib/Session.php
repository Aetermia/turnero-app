<?php

declare(strict_types=1);

/*
 * One PHP session per visitor. It carries the CSRF token of the public forms
 * and, after login, the admin identity. The cookie is HttpOnly (no script can
 * read it), SameSite=Lax (another site cannot post with it) and Secure in
 * production (it never travels over plain HTTP).
 */
final class Session
{
    private const NAME = 'casa_session';

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_name(self::NAME);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => Config::isProduction() || is_https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    /** New session id on privilege change (login/logout), against fixation. */
    public static function regenerate(): void
    {
        self::start();
        session_regenerate_id(true);
    }

    public static function get(string $key): mixed
    {
        self::start();
        return $_SESSION[$key] ?? null;
    }

    public static function set(string $key, mixed $value): void
    {
        self::start();
        $_SESSION[$key] = $value;
    }

    public static function forget(string $key): void
    {
        self::start();
        unset($_SESSION[$key]);
    }

    /** One-shot message shown on the next page (e.g. after a redirect). */
    public static function flash(string $key, mixed $value = null): mixed
    {
        self::start();
        if (func_num_args() === 2) {
            $_SESSION['_flash'][$key] = $value;
            return null;
        }
        $stored = $_SESSION['_flash'][$key] ?? null;
        unset($_SESSION['_flash'][$key]);
        return $stored;
    }
}
