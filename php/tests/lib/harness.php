<?php
/*
 * Test harness for the verification scripts. Each script runs against a real
 * MySQL/MariaDB database (never mocks): by default a throwaway database named
 * casa_test that is dropped and rebuilt from database/schema.sql on every run.
 *
 * Connection settings come from environment variables:
 *   TEST_DB_HOST (127.0.0.1)  TEST_DB_PORT (3306)  TEST_DB_NAME (casa_test)
 *   TEST_DB_USER (casa)       TEST_DB_PASS (casa_dev)
 */

declare(strict_types=1);

const TEST_ROOT = __DIR__ . '/../..';

function test_db_settings(): array
{
    return [
        'host' => getenv('TEST_DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('TEST_DB_PORT') ?: 3306),
        'name' => getenv('TEST_DB_NAME') ?: 'casa_test',
        'user' => getenv('TEST_DB_USER') ?: 'casa',
        'password' => getenv('TEST_DB_PASS') !== false ? (string) getenv('TEST_DB_PASS') : 'casa_dev',
    ];
}

function test_pdo(bool $withDatabase = true): PDO
{
    $s = test_db_settings();
    $dsn = "mysql:host={$s['host']};port={$s['port']};charset=utf8mb4" . ($withDatabase ? ";dbname={$s['name']}" : '');
    $pdo = new PDO($dsn, $s['user'], $s['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

/** Drops and recreates the test database from database/schema.sql. */
function reset_test_database(): PDO
{
    $s = test_db_settings();
    if (!str_ends_with($s['name'], '_test')) {
        throw new RuntimeException('Refusing to reset a database whose name does not end in _test');
    }
    $server = test_pdo(false);
    $server->exec("DROP DATABASE IF EXISTS `{$s['name']}`");
    $server->exec("CREATE DATABASE `{$s['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo = test_pdo();
    $schema = (string) file_get_contents(TEST_ROOT . '/database/schema.sql');
    foreach (split_sql($schema) as $statement) {
        $pdo->exec($statement);
    }
    return $pdo;
}

/** Splits a schema file on semicolons that end a statement (no procedures). */
function split_sql(string $sql): array
{
    $lines = array_filter(
        explode("\n", $sql),
        static fn (string $line): bool => !str_starts_with(ltrim($line), '--'),
    );
    $statements = array_map('trim', explode(";\n", implode("\n", $lines)));
    return array_values(array_filter($statements, static fn (string $s): bool => $s !== '' && $s !== ';'));
}

$GLOBALS['__failures'] = 0;
$GLOBALS['__passes'] = 0;

function check(bool $condition, string $label): void
{
    if ($condition) {
        $GLOBALS['__passes']++;
        echo "  PASS  {$label}\n";
    } else {
        $GLOBALS['__failures']++;
        echo "  FAIL  {$label}\n";
    }
}

/** Runs $fn and returns the PDOException it threw, or null if none. */
function expect_pdo_error(callable $fn): ?PDOException
{
    try {
        $fn();
    } catch (PDOException $error) {
        return $error;
    }
    return null;
}

function finish(): never
{
    $failures = $GLOBALS['__failures'];
    $passes = $GLOBALS['__passes'];
    echo "\n" . ($failures === 0 ? 'RESULT: PASS' : 'RESULT: FAIL') . " ({$passes} passed, {$failures} failed)\n";
    exit($failures === 0 ? 0 : 1);
}

function t_uuid(): string
{
    $hex = bin2hex(random_bytes(16));
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-4' . substr($hex, 13, 3) . '-a'
        . substr($hex, 17, 3) . '-' . substr($hex, 20, 12);
}

/** Inserts an event and returns its id. */
function t_event(PDO $pdo, array $overrides = []): string
{
    $row = $overrides + [
        'id' => t_uuid(),
        'title' => 'Evento de prueba',
        'theme' => 'Pintura',
        'starts_at' => gmdate('Y-m-d H:i:s', time() + 7 * 86400),
        'ends_at' => gmdate('Y-m-d H:i:s', time() + 7 * 86400 + 7200),
        'capacity' => 5,
        'price' => '15000.00',
        'is_published' => 1,
    ];
    $pdo->prepare('INSERT INTO events (id, title, theme, starts_at, ends_at, capacity, price, is_published)
                   VALUES (:id, :title, :theme, :starts_at, :ends_at, :capacity, :price, :is_published)')
        ->execute($row);
    return $row['id'];
}

/** Inserts a customer and returns its id. */
function t_customer(PDO $pdo, string $email): string
{
    $id = t_uuid();
    $pdo->prepare('INSERT INTO customers (id, full_name, email, whatsapp) VALUES (?, ?, ?, ?)')
        ->execute([$id, 'Persona de Prueba', strtolower($email), '2494000000']);
    return $id;
}

/** Inserts a reservation row directly (bypassing the app) and returns its id. */
function t_reservation(PDO $pdo, string $eventId, string $customerId, string $status, ?string $expiresAtSql = null): string
{
    $id = t_uuid();
    $expires = $expiresAtSql === null ? 'NULL' : $expiresAtSql;
    $pdo->prepare("INSERT INTO reservations (id, event_id, customer_id, status, public_token, expires_at, has_condition)
                   VALUES (?, ?, ?, ?, ?, {$expires}, 0)")
        ->execute([$id, $eventId, $customerId, $status, bin2hex(random_bytes(32))]);
    return $id;
}

/** A throwaway config.php pointing at the test database. */
function write_test_config(array $extra = []): string
{
    $s = test_db_settings();
    $path = sys_get_temp_dir() . '/casa-test-config-' . getmypid() . '-' . bin2hex(random_bytes(3)) . '.php';
    $config = array_replace_recursive([
        'env' => 'development',
        'db' => ['host' => $s['host'], 'port' => $s['port'], 'name' => $s['name'], 'user' => $s['user'], 'password' => $s['password']],
        'payment_alias' => 'alias.de.prueba',
        'admin' => ['user' => 'admin', 'password_hash' => ''],
    ], $extra);
    file_put_contents($path, '<?php return ' . var_export($config, true) . ';');
    register_shutdown_function(static fn () => @unlink($path));
    return $path;
}

/**
 * Starts PHP's built-in server on the real front controller, with the given
 * config, and stops it when the script ends. Returns the base URL.
 */
function start_test_server(string $configPath, int $port = 0, array $ini = []): string
{
    $port = $port ?: random_int(20000, 40000);
    $iniArgs = '';
    foreach ($ini as $key => $value) {
        $iniArgs .= ' -d ' . escapeshellarg("{$key}={$value}");
    }
    $cmd = 'exec env CASA_CONFIG_PATH=' . escapeshellarg($configPath)
        . ' php' . $iniArgs . ' -S 127.0.0.1:' . $port
        . ' -t ' . escapeshellarg(TEST_ROOT . '/public')
        . ' ' . escapeshellarg(TEST_ROOT . '/tools/dev-router.php');
    $process = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    register_shutdown_function(static function () use ($process): void {
        proc_terminate($process);
    });
    $base = "http://127.0.0.1:{$port}";
    for ($i = 0; $i < 50; $i++) {
        if (@fsockopen('127.0.0.1', $port)) {
            return $base;
        }
        usleep(100_000);
    }
    throw new RuntimeException('Test server did not start');
}

/**
 * Minimal HTTP client (curl extension or stream fallback is overkill: use the
 * curl CLI-less stream wrapper). Returns [status, headers, body].
 *
 * @param array<string, string> $headers
 * @return array{int, array<string, list<string>>, string}
 */
function http(string $method, string $url, array $options = []): array
{
    $ch = curl_init($url);
    $headerLines = [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$headerLines): int {
            $headerLines[] = $line;
            return strlen($line);
        },
    ]);
    if (isset($options['headers'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $options['headers']);
    }
    if (isset($options['cookie'])) {
        curl_setopt($ch, CURLOPT_COOKIE, $options['cookie']);
    }
    if (array_key_exists('body', $options)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $options['body']);
    }
    $body = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $headers = [];
    foreach ($headerLines as $line) {
        if (str_contains($line, ':')) {
            [$name, $value] = explode(':', $line, 2);
            $headers[strtolower(trim($name))][] = trim($value);
        }
    }
    return [$status, $headers, $body];
}
