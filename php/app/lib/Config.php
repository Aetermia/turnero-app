<?php

declare(strict_types=1);

/*
 * Reads config/config.php once. A missing or unreadable file is not fatal for
 * the process: the public pages answer with a "not configured" page and the
 * admin panel refuses everyone (it fails closed), instead of crashing with a
 * stack trace that could leak paths.
 */
final class Config
{
    /** @var array<string, mixed>|null */
    private static ?array $values = null;

    public static function load(string $path): void
    {
        if (!is_file($path)) {
            self::$values = null;
            return;
        }
        $values = require $path;
        self::$values = is_array($values) ? $values : null;
    }

    public static function isLoaded(): bool
    {
        return self::$values !== null;
    }

    /**
     * Dot-notation lookup, e.g. Config::get('db.host').
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $node = self::$values;
        foreach (explode('.', $key) as $part) {
            if (!is_array($node) || !array_key_exists($part, $node)) {
                return $default;
            }
            $node = $node[$part];
        }
        return $node;
    }

    /** Anything but an explicit "development" counts as production. */
    public static function isProduction(): bool
    {
        return self::get('env', 'production') !== 'development';
    }

    /** True only when a real database name and user were filled in. */
    public static function hasDatabase(): bool
    {
        $name = (string) self::get('db.name', '');
        $user = (string) self::get('db.user', '');
        return $name !== '' && $user !== '' && $name !== 'CHANGE_ME' && $user !== 'CHANGE_ME';
    }

    public static function paymentAlias(): ?string
    {
        $alias = trim((string) self::get('payment_alias', ''));
        return $alias === '' ? null : $alias;
    }
}
