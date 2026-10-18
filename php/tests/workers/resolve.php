<?php
/*
 * One approve or reject attempt in its own process and connection, released
 * at a shared start instant. Prints "1" when this call changed the row.
 *
 * Usage: php resolve.php <approve|reject> <reservationId> <startAtMicrotime>
 */

declare(strict_types=1);

require __DIR__ . '/../lib/harness.php';
require __DIR__ . '/../../app/bootstrap.php';

[, $action, $id, $startAt] = $argv;
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));

while (microtime(true) < (float) $startAt) {
    usleep(500);
}

$changed = $action === 'approve' ? ReservationsAdmin::approve($id) : ReservationsAdmin::reject($id, 'carrera');
echo $changed ? '1' : '0';
