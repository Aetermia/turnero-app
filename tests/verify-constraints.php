<?php
/*
 * P2 — the database itself enforces the core integrity rules (equivalent to
 * scripts/verify-constraints.sql in the Next.js version):
 *   - one active reservation per person and event (generated column + unique)
 *   - rejected / expired / cancelled rows never block a new attempt
 *   - public tokens are unique
 *   - an event or a person with reservations cannot be deleted (RESTRICT)
 *
 * Run: php tests/verify-constraints.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';

$pdo = reset_test_database();
echo "Schema loaded into a fresh test database.\n\n";

$tables = $pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME")
    ->fetchAll(PDO::FETCH_COLUMN);
check($tables === ['customers', 'events', 'reservations'], 'three tables exist: ' . implode(', ', $tables));

$engines = $pdo->query("SELECT DISTINCT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
    ->fetchAll(PDO::FETCH_COLUMN);
check($engines === ['InnoDB'], 'every table is InnoDB (transactions and row locks)');

$indexes = $pdo->query("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
                        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND NON_UNIQUE = 0")
    ->fetchAll(PDO::FETCH_COLUMN);
check(in_array('reservations_active_per_person_unique', $indexes, true), 'unique index reservations_active_per_person_unique exists');
check(in_array('reservations_public_token_unique', $indexes, true), 'unique index reservations_public_token_unique exists');

echo "\nOne active reservation per person and event:\n";
$event = t_event($pdo);
$person = t_customer($pdo, 'ana@example.com');

$first = t_reservation($pdo, $event, $person, 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE');
check(true, 'the first active reservation is accepted');

$duplicate = expect_pdo_error(fn () => t_reservation($pdo, $event, $person, 'pending_review'));
check($duplicate !== null && ($duplicate->errorInfo[1] ?? null) === 1062,
    'a SECOND active reservation for the same person and event is REJECTED by the database (1062)');
if ($duplicate) {
    echo '        -> ' . $duplicate->errorInfo[2] . "\n";
}

foreach (['pending_review', 'approved'] as $status) {
    $pdo->prepare('UPDATE reservations SET status = ? WHERE id = ?')->execute([$status, $first]);
    $err = expect_pdo_error(fn () => t_reservation($pdo, $event, $person, 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE'));
    check($err !== null, "while the first one is {$status}, a new active one is still rejected");
}

$pdo->prepare("UPDATE reservations SET status = 'rejected' WHERE id = ?")->execute([$first]);
$err = expect_pdo_error(function () use ($pdo, $event, $person, &$second): void {
    $second = t_reservation($pdo, $event, $person, 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE');
});
check($err === null, 'after the owner REJECTS the first one, the same person CAN book again');

foreach (['expired', 'cancelled'] as $status) {
    $pdo->prepare('UPDATE reservations SET status = ? WHERE id = ?')->execute([$status, $second]);
    $err = expect_pdo_error(function () use ($pdo, $event, $person, &$second): void {
        $second = t_reservation($pdo, $event, $person, 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE');
    });
    check($err === null, "a {$status} reservation does not block a new attempt");
}

$otherEvent = t_event($pdo);
$err = expect_pdo_error(fn () => t_reservation($pdo, $otherEvent, $person, 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE'));
check($err === null, 'the same person can hold an active reservation in a DIFFERENT event');

$otherPerson = t_customer($pdo, 'beto@example.com');
$err = expect_pdo_error(fn () => t_reservation($pdo, $event, $otherPerson, 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE'));
check($err === null, 'a DIFFERENT person can book the same event');

$rows = (int) $pdo->query("SELECT COUNT(*) FROM reservations WHERE event_id = " . $pdo->quote($event) . " AND customer_id = " . $pdo->quote($person))->fetchColumn();
check($rows === 4, "the history is kept: {$rows} rows for that person and event (3 closed + 1 active)");

echo "\nOther integrity rules:\n";
$err = expect_pdo_error(function () use ($pdo, $event, $otherPerson): void {
    $pdo->prepare("INSERT INTO reservations (id, event_id, customer_id, status, public_token, has_condition)
                   SELECT ?, event_id, customer_id, 'rejected', public_token, 0 FROM reservations WHERE event_id = ? LIMIT 1")
        ->execute([t_uuid(), $event]);
});
check($err !== null && ($err->errorInfo[1] ?? null) === 1062, 'a repeated public token is rejected');

$err = expect_pdo_error(fn () => t_customer($pdo, 'ana@example.com'));
check($err !== null && ($err->errorInfo[1] ?? null) === 1062, 'a repeated email is rejected (dedupe by person)');

$err = expect_pdo_error(fn () => $pdo->prepare('DELETE FROM events WHERE id = ?')->execute([$event]));
check($err !== null && ($err->errorInfo[1] ?? null) === 1451, 'an event WITH reservations cannot be deleted (RESTRICT, 1451)');

$err = expect_pdo_error(fn () => $pdo->prepare('DELETE FROM customers WHERE id = ?')->execute([$person]));
check($err !== null && ($err->errorInfo[1] ?? null) === 1451, 'a person WITH reservations cannot be deleted (RESTRICT, 1451)');

$price = $pdo->query("SELECT price FROM events WHERE id = " . $pdo->quote($event))->fetchColumn();
check($price === '15000.00', "price comes back as the string '15000.00' (never a float)");

finish();
