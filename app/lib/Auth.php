<?php

declare(strict_types=1);

/*
 * Single-user admin authentication (port of src/lib/auth.ts).
 *
 *  - The password lives only as a password_hash() value in config.php: never
 *    in the database, never in the code.
 *  - Login regenerates the session id (no session fixation) and records an
 *    absolute expiry: 7 days, like the Max-Age of the Next.js cookie.
 *  - Fails closed: without a user and a VALID hash in config.php nobody gets
 *    in, whatever they type.
 */
final class Auth
{
    public const SESSION_SECONDS = 7 * 24 * 60 * 60;

    /** A valid bcrypt/argon hash of a long random string: used to keep the timing even. */
    private const DUMMY_HASH = '$2y$10$Ia2y6MthzkIWsfd1BKv13.yv4VzbI9QFqoP945BVf9CmxvTU9lK/S';

    public static function isConfigured(): bool
    {
        $user = trim((string) Config::get('admin.user', ''));
        $hash = (string) Config::get('admin.password_hash', '');
        return $user !== '' && $hash !== '' && password_get_info($hash)['algo'] !== null;
    }

    public static function attempt(string $username, string $password): bool
    {
        if (!self::isConfigured()) {
            return false;
        }
        $expectedUser = trim((string) Config::get('admin.user'));
        $hash = (string) Config::get('admin.password_hash');
        $userMatches = hash_equals($expectedUser, $username);
        // Always run one password_verify, so a wrong user and a wrong password
        // take the same time and do not reveal which one failed.
        $passwordMatches = password_verify($password, $userMatches ? $hash : self::DUMMY_HASH);
        return $userMatches && $passwordMatches;
    }

    public static function login(string $username): void
    {
        Session::regenerate();
        Session::set('admin_user', $username);
        Session::set('admin_expires', time() + self::SESSION_SECONDS);
        Session::extendCookie(self::SESSION_SECONDS);
    }

    public static function logout(): void
    {
        Session::forget('admin_user');
        Session::forget('admin_expires');
        Session::regenerate();
        Session::extendCookie(0);
    }

    /** The logged-in admin user, or null. Re-checks configuration every time. */
    public static function user(): ?string
    {
        if (!self::isConfigured()) {
            return null;
        }
        $user = Session::get('admin_user');
        $expires = Session::get('admin_expires');
        if (!is_string($user) || !is_int($expires) || $expires <= time()) {
            return null;
        }
        // The configured user may have changed since the login.
        if (!hash_equals(trim((string) Config::get('admin.user')), $user)) {
            return null;
        }
        return $user;
    }

    /** Guard for every panel page and action: no session, no panel. */
    public static function requireAdmin(): string
    {
        $user = self::user();
        if ($user === null) {
            redirect('/admin/login', 307);
        }
        return $user;
    }
}
