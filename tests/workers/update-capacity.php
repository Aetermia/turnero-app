<?php
/*
 * Lowers an event's capacity in its own process and connection, released at
 * a shared instant (to race against a booking). Usage:
 *   php update-capacity.php <eventId> <capacity> <startAtMicrotime>
 */

declare(strict_types=1);

require __DIR__ . '/../lib/harness.php';
require __DIR__ . '/../../app/bootstrap.php';

[, $eventId, $capacity, $startAt] = $argv;
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));
$event = EventsAdmin::find($eventId);
$values = [
    'title' => $event['title'], 'theme' => $event['theme'], 'description' => $event['description'],
    'location' => $event['location'], 'starts_at' => $event['starts_at'], 'ends_at' => $event['ends_at'],
    'capacity' => (int) $capacity, 'price' => $event['price'], 'is_published' => $event['is_published'],
];
while (microtime(true) < (float) $startAt) {
    usleep(500);
}
echo json_encode(EventsAdmin::update($eventId, $values));
