<?php

declare(strict_types=1);

/*
 * The single database connection, opened lazily on first use.
 *
 *  - Real prepared statements (EMULATE_PREPARES off): values never get spliced
 *    into SQL text, not even by the driver.
 *  - utf8mb4 end to end, so accents and ñ survive intact.
 *  - time_zone '+00:00': NOW() is UTC, the same clock the stored DATETIMEs
 *    use. Seat counts and hold expiry are computed with the database clock,
 *    never with PHP's (R3).
 *  - Exceptions on every error, so a failed query can never be mistaken for
 *    an empty result.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }
        if (!Config::hasDatabase()) {
            throw new DatabaseNotConfigured('The database is not configured in config/config.php');
        }
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            (string) Config::get('db.host', 'localhost'),
            (int) Config::get('db.port', 3306),
            (string) Config::get('db.name'),
        );
        self::$pdo = self::connect($dsn, (string) Config::get('db.user'), (string) Config::get('db.password', ''));
        return self::$pdo;
    }

    public static function connect(string $dsn, string $user, string $password): PDO
    {
        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        return $pdo;
    }

    /** Lets the verification scripts run the real domain code on their database. */
    public static function use(PDO $pdo): void
    {
        self::$pdo = $pdo;
    }

    /**
     * Runs $work inside a transaction: commit if it returns, rollback if it
     * throws (and rethrow). InnoDB row locks taken inside (SELECT ... FOR
     * UPDATE) are held until the commit or rollback.
     *
     * @template T
     * @param callable(PDO): T $work
     * @return T
     */
    public static function transaction(callable $work): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $work($pdo);
            $pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }

    /**
     * @param array<int|string, mixed> $params
     * @return list<array<string, mixed>>
     */
    public static function all(string $sql, array $params = []): array
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }

    /**
     * @param array<int|string, mixed> $params
     * @return array<string, mixed>|null
     */
    public static function one(string $sql, array $params = []): ?array
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();
        return $row === false ? null : $row;
    }

    /** @param array<int|string, mixed> $params */
    public static function run(string $sql, array $params = []): int
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        return $statement->rowCount();
    }
}

final class DatabaseNotConfigured extends RuntimeException
{
}
