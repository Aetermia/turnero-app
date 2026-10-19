<?php
/*
 * P3 — the connection behaves the way the rest of the app relies on:
 *   - UTC session time zone (NOW() is UTC), real prepared statements
 *   - utf8mb4 round trip byte for byte (accents, ñ, emoji)
 *   - DECIMAL comes back as a string
 *   - Db::transaction commits on success and rolls back on an exception
 *   - the seed is idempotent and loads 3 published events + 1 draft
 *
 * Run: php tests/verify-connection.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));

echo "Connection settings:\n";
$tz = Db::one('SELECT @@session.time_zone AS tz, TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP()) AS drift');
check($tz['tz'] === '+00:00', 'session time_zone is +00:00');
check((int) $tz['drift'] === 0, 'NOW() equals UTC_TIMESTAMP() (database clock in UTC)');
check((int) Db::pdo()->getAttribute(PDO::ATTR_EMULATE_PREPARES) === 0, 'PDO emulation of prepared statements is off');
// Stronger proof: a real prepare increments the server's own counter.
$prepares = static fn (): int => (int) Db::one("SHOW SESSION STATUS LIKE 'Com_stmt_prepare'")['Value'];
$beforePrepare = $prepares();
Db::one('SELECT ? AS v', [1]);
check($prepares() > $beforePrepare, 'the server itself receives a PREPARE (values never spliced into SQL)');
$charset = Db::one("SELECT @@character_set_client AS c, @@character_set_connection AS n, @@character_set_results AS r");
check($charset === ['c' => 'utf8mb4', 'n' => 'utf8mb4', 'r' => 'utf8mb4'], 'client/connection/results charset are utf8mb4');

echo "\nData round trips:\n";
$id = uuid_v4();
check(is_uuid($id), "uuid_v4() produces a valid UUID ({$id})");
$title = 'Círculo de escritura — ñandú 🌷';
Db::run('INSERT INTO events (id, title, starts_at, ends_at, capacity, price) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1, ?)', [$id, $title, '1234.50']);
$row = Db::one('SELECT title, HEX(title) AS hex, price FROM events WHERE id = ?', [$id]);
check($row['title'] === $title, 'utf8mb4 text comes back identical (accents, ñ, emoji)');
check(strtoupper(bin2hex($title)) === $row['hex'], 'stored bytes are exactly the UTF-8 bytes sent');
check($row['price'] === '1234.50', "DECIMAL comes back as the string '1234.50'");
check(Format::price($row['price']) === "\$\u{00A0}1.234,50", 'Format::price gives "$ 1.234,50" like Intl es-AR');

echo "\nTransactions:\n";
$before = (int) Db::one('SELECT COUNT(*) AS n FROM events')['n'];
try {
    Db::transaction(static function (PDO $pdo): void {
        $pdo->prepare('INSERT INTO events (id, title, starts_at, ends_at, capacity, price) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1, 1)')
            ->execute([uuid_v4(), 'Se tiene que deshacer']);
        throw new RuntimeException('boom');
    });
} catch (RuntimeException) {
}
$after = (int) Db::one('SELECT COUNT(*) AS n FROM events')['n'];
check($after === $before, 'an exception inside Db::transaction rolls the insert back');
check(Db::pdo()->inTransaction() === false, 'no transaction is left open after the rollback');
Db::transaction(static function (PDO $pdo): void {
    $pdo->prepare('INSERT INTO events (id, title, starts_at, ends_at, capacity, price) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1, 1)')
        ->execute([uuid_v4(), 'Se tiene que guardar']);
});
check((int) Db::one('SELECT COUNT(*) AS n FROM events')['n'] === $before + 1, 'a successful Db::transaction commits');

echo "\nSeed (database/seed.php against the test database):\n";
Db::run('DELETE FROM events');
$env = 'CASA_CONFIG_PATH=' . escapeshellarg(write_test_config());
$first = shell_exec($env . ' php ' . escapeshellarg(TEST_ROOT . '/database/seed.php') . ' 2>&1');
$second = shell_exec($env . ' php ' . escapeshellarg(TEST_ROOT . '/database/seed.php') . ' 2>&1');
check(str_contains((string) $first, 'Seed complete: 4 events inserted.'), 'first run inserts 4 events');
check(str_contains((string) $second, 'Seed skipped'), 'second run is skipped (idempotent)');
$counts = Db::one('SELECT SUM(is_published = 1) AS published, SUM(is_published = 0) AS drafts FROM events');
check((int) $counts['published'] === 3 && (int) $counts['drafts'] === 1, '3 published events + 1 draft');
$acuarela = Db::one("SELECT starts_at, image_url FROM events WHERE title LIKE 'Taller de acuarela%'");
check(Format::eventTime($acuarela['starts_at']) === '18 hs', 'the watercolor workshop starts at 18 hs Buenos Aires time');
check($acuarela['image_url'] === '/img/Acuarelas.webp' && is_file(TEST_ROOT . '/public' . $acuarela['image_url']),
    'its photo path matches a real file, letter for letter');

finish();

