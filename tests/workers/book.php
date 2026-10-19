<?php
/*
 * One booking attempt in its own process and its own database connection.
 * Waits until a shared start instant so every worker hits the database at the
 * same moment, then calls the REAL Reservations::create and prints the result.
 *
 * Usage: php book.php <eventId> <email> <startAtMicrotime>
 */

declare(strict_types=1);

require __DIR__ . '/../lib/harness.php';
require __DIR__ . '/../../app/bootstrap.php';

[, $eventId, $email, $startAt] = $argv;
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));

while (microtime(true) < (float) $startAt) {
    usleep(500);
}

$result = Reservations::create($eventId, [
    'full_name' => 'Persona Concurrente',
    'email' => $email,
    'whatsapp' => '2494000000',
    'has_condition' => false,
    'condition_details' => null,
    'marketing_consent' => false,
]);
echo json_encode($result);
