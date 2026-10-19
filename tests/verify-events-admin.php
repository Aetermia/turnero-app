<?php
/*
 * P8 — event management from the panel (equivalent to
 * scripts/verify-events-admin.mjs, plus HTTP, timezone, a race and photos):
 *   - the capacity guard REJECTS capacity < occupied and ACCEPTS == occupied
 *   - an expired hold, cancelled, rejected and expired rows do not count;
 *     approved and pending_review do
 *   - unpublishing removes the event from the catalog without touching its
 *     reservations; malformed ids are "not found", never a 500
 *   - a capacity cut racing a booking never ends with more seats taken than
 *     the capacity
 *   - HTTP: session and CSRF required, original messages, 18:00 Buenos Aires
 *     stored as 21:00 UTC and shown back as 18:00
 *   - photos: stored under public/uploads/events, replaced, removed, typed by
 *     content; the sample photos in /img are never deleted
 *
 * Run: php tests/verify-events-admin.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));
$createdEvents = [];
register_shutdown_function(static function () use (&$createdEvents): void {
    foreach ($createdEvents as $id) {
        array_map('unlink', glob(EventImages::directory() . "/{$id}/*") ?: []);
        @rmdir(EventImages::directory() . "/{$id}");
    }
});

/** @return array<string, mixed> */
function values_for(array $event, array $overrides = []): array
{
    return $overrides + [
        'title' => $event['title'], 'theme' => $event['theme'], 'description' => $event['description'],
        'location' => $event['location'], 'starts_at' => $event['starts_at'], 'ends_at' => $event['ends_at'],
        'capacity' => $event['capacity'], 'price' => $event['price'], 'is_published' => $event['is_published'],
    ];
}

echo "Capacity guard (in SQL, under the event lock):\n";
$id = t_event($pdo, ['title' => 'Guardia', 'capacity' => 10]);
$person = static fn (string $email): string => t_customer($pdo, $email);
t_reservation($pdo, $id, $person('a@example.com'), 'approved');
t_reservation($pdo, $id, $person('b@example.com'), 'pending_review');
t_reservation($pdo, $id, $person('c@example.com'), 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE');
t_reservation($pdo, $id, $person('d@example.com'), 'pending_no_receipt', 'NOW() - INTERVAL 1 MINUTE');
t_reservation($pdo, $id, $person('e@example.com'), 'cancelled');
t_reservation($pdo, $id, $person('f@example.com'), 'rejected');
t_reservation($pdo, $id, $person('g@example.com'), 'expired');
$event = EventsAdmin::find($id);
check($event['occupied'] === 3, 'occupied = 3: approved + pending_review + live hold (expired hold, cancelled, rejected, expired do not count)');
check(EventsAdmin::update($id, values_for($event, ['capacity' => 2])) === ['ok' => false, 'reason' => 'capacity_below_occupied'], 'capacity 2 < 3 occupied is REJECTED');
check(EventsAdmin::find($id)['capacity'] === 10, 'and the capacity stays 10');
check(EventsAdmin::update($id, values_for($event, ['capacity' => 3])) === ['ok' => true], 'capacity 3 == 3 occupied is ACCEPTED (exact limit)');
check(EventsAdmin::find($id)['capacity'] === 3 && EventsAdmin::find($id)['seats_available'] === 0, 'saved: 3 seats, 0 available');
check(EventsAdmin::update($id, values_for(EventsAdmin::find($id), ['title' => 'Mismo cupo, otro título'])) === ['ok' => true], 'an edit that keeps the capacity is fine');
check(EventsAdmin::update(t_uuid(), values_for($event)) === ['ok' => false, 'reason' => 'not_found'], 'an unknown id is not_found');
check(EventsAdmin::update('no-es-uuid', values_for($event)) === ['ok' => false, 'reason' => 'not_found'], 'a malformed id is not_found (never a 500)');
check(EventsAdmin::find('no-es-uuid') === null && EventsAdmin::setPublished('x', true) === false && EventsAdmin::setImage('x', null) === false, 'find/setPublished/setImage with a malformed id return null/false');

echo "\nPublish / unpublish:\n";
$pub = t_event($pdo, ['title' => 'Para despublicar', 'capacity' => 5]);
t_reservation($pdo, $pub, $person('h@example.com'), 'approved');
$before = (int) $pdo->query('SELECT COUNT(*) FROM reservations WHERE event_id = ' . $pdo->quote($pub))->fetchColumn();
EventsAdmin::setPublished($pub, false);
check(Events::publishedById($pub) === null, 'unpublished: it leaves the public catalog');
$after = (int) $pdo->query('SELECT COUNT(*) FROM reservations WHERE event_id = ' . $pdo->quote($pub))->fetchColumn();
check($before === $after && $after === 1, 'and its reservations are untouched');
EventsAdmin::setPublished($pub, true);
check(Events::publishedById($pub) !== null, 'published again: it is back');

echo "\nRace: lowering capacity while someone books (10 rounds):\n";
$violations = 0;
$outcomes = [];
for ($round = 1; $round <= 10; $round++) {
    $race = t_event($pdo, ['title' => "Carrera {$round}", 'capacity' => 2]);
    t_reservation($pdo, $race, $person("ya{$round}@example.com"), 'approved');
    $startAt = microtime(true) + 1.2;
    $book = proc_open('php ' . escapeshellarg(__DIR__ . '/workers/book.php') . ' ' . escapeshellarg($race) . " nuevo{$round}@example.com {$startAt}", [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $bp);
    $edit = proc_open('php ' . escapeshellarg(__DIR__ . '/workers/update-capacity.php') . ' ' . escapeshellarg($race) . " 1 {$startAt}", [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $ep);
    $booking = json_decode((string) stream_get_contents($bp[1]), true);
    $update = json_decode((string) stream_get_contents($ep[1]), true);
    proc_close($book);
    proc_close($edit);
    $final = EventsAdmin::find($race);
    if ($final['occupied'] > $final['capacity']) {
        $violations++;
    }
    $outcomes[] = (($booking['ok'] ?? false) ? 'booking' : 'cut');
}
check($violations === 0, 'never more seats taken than the capacity (' . implode(', ', array_count_values($outcomes) ? array_map(fn ($k, $v) => "{$k} won {$v}x", array_keys(array_count_values($outcomes)), array_count_values($outcomes)) : []) . ')');

echo "\nPanel over HTTP:\n";
$password = 'clave-del-panel-larga';
$base = start_test_server(write_test_config(['admin' => ['user' => 'duena', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)]]));
[$status, $headers] = http('GET', "{$base}/admin/eventos");
check($status === 307, 'without a session /admin/eventos answers 307');
[$status] = http('POST', "{$base}/admin/eventos/nuevo", ['body' => http_build_query(['title' => 'X'])]);
check($status === 307, 'without a session a create POST answers 307 (nothing saved)');

[, $h, $html] = http('GET', "{$base}/admin/login");
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
$cookie = explode(';', ($h['set-cookie'] ?? [''])[count($h['set-cookie'] ?? ['']) - 1])[0];
[, $h] = http('POST', "{$base}/admin/login", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $m[1], 'username' => 'duena', 'password' => $password])]);
foreach ($h['set-cookie'] ?? [] as $c) {
    $cookie = explode(';', $c)[0];
}
[$status, , $html] = http('GET', "{$base}/admin/eventos/nuevo", ['cookie' => $cookie]);
preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m);
$csrf = $m[1];
check($status === 200 && str_contains($html, 'Nuevo evento') && str_contains($html, '← Volver al panel'), 'logged in: the form renders, with "Volver al panel"');

[$status] = http('POST', "{$base}/admin/eventos/nuevo", ['cookie' => $cookie, 'body' => http_build_query(['title' => 'Sin token'])]);
check($status === 403, 'a create POST without the CSRF token is rejected (403)');
[$status, , $html] = http('POST', "{$base}/admin/eventos/nuevo", ['cookie' => $cookie, 'body' => http_build_query([
    '_csrf' => $csrf, 'title' => '', 'startsAt' => '2026-12-05T18:00', 'endsAt' => '2026-12-05T17:00', 'capacity' => '0', 'price' => '0,00',
])]);
check($status === 422, 'invalid data answers 422');
foreach (['Ingresá un título', 'El fin tiene que ser posterior al inicio', 'La capacidad tiene que ser mayor a cero', 'Ingresá un precio válido (por ejemplo 15000 o 15000,50)'] as $msg) {
    check(str_contains($html, $msg), "shows: \"{$msg}\"");
}
[$status, $h] = http('POST', "{$base}/admin/eventos/nuevo", ['cookie' => $cookie, 'body' => http_build_query([
    '_csrf' => $csrf, 'title' => 'Taller de bordado', 'theme' => 'Bordado', 'description' => 'Puntadas básicas.', 'location' => 'Galería',
    'startsAt' => '2026-12-05T18:00', 'endsAt' => '2026-12-05T20:30', 'capacity' => '8', 'price' => '9500,50', 'isPublished' => 'on',
])]);
check($status === 303 && ($h['location'][0] ?? '') === '/admin/eventos', 'a valid event is created (303 to the list)');
$created = Db::one("SELECT * FROM events WHERE title = 'Taller de bordado'");
$createdEvents[] = $created['id'];
check($created['starts_at'] === '2026-12-05 21:00:00' && $created['ends_at'] === '2026-12-05 23:30:00', '18:00 / 20:30 Buenos Aires are stored as 21:00 / 23:30 UTC');
check($created['price'] === '9500.50' && (int) $created['is_published'] === 1 && $created['description'] === 'Puntadas básicas.', 'price "9500,50" stored as 9500.50; published; text intact');
[, , $catalog] = http('GET', "{$base}/");
check(str_contains($catalog, 'Taller de bordado') && str_contains($catalog, '18 a 20:30 hs'), 'it appears in the public catalog as "18 a 20:30 hs"');
[$status, , $html] = http('GET', "{$base}/admin/eventos/{$created['id']}", ['cookie' => $cookie]);
check($status === 200 && str_contains($html, 'value="2026-12-05T18:00"') && str_contains($html, 'value="9500.50"'), 'the edit form shows 18:00 back, and the price');
[$status, , $list] = http('GET', "{$base}/admin/eventos", ['cookie' => $cookie]);
check(str_contains($list, 'Taller de bordado') && str_contains($list, 'Publicado') && str_contains($list, '0 de 8 lugares ocupados'), 'the list shows it as Publicado with "0 de 8 lugares ocupados"');

t_reservation($pdo, $created['id'], $person('i@example.com'), 'approved');
t_reservation($pdo, $created['id'], $person('j@example.com'), 'approved');
[$status, , $html] = http('POST', "{$base}/admin/eventos/{$created['id']}", ['cookie' => $cookie, 'body' => http_build_query([
    '_csrf' => $csrf, 'title' => 'Taller de bordado', 'startsAt' => '2026-12-05T18:00', 'endsAt' => '2026-12-05T20:30', 'capacity' => '1', 'price' => '9500,50', 'isPublished' => 'on',
])]);
check($status === 422 && str_contains($html, 'No podés bajar la capacidad por debajo de los lugares ya ocupados.'), 'lowering capacity below 2 occupied shows the original message');
[$status] = http('POST', "{$base}/admin/eventos/{$created['id']}/publicar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf, 'publish' => 'false'])]);
[, , $catalog] = http('GET', "{$base}/");
check($status === 303 && !str_contains($catalog, 'Taller de bordado'), '"Despublicar" removes it from the catalog');
[$status] = http('GET', "{$base}/admin/eventos/no-es-uuid", ['cookie' => $cookie]);
check($status === 404, 'editing a malformed id answers 404');

echo "\nEvent photo:\n";
$work = sys_get_temp_dir() . '/casa-photo-' . getmypid();
@mkdir($work);
$jpg = "{$work}/foto.jpg";
$img = imagecreatetruecolor(900, 1200);
imagefilledrectangle($img, 0, 0, 900, 1200, imagecolorallocate($img, 120, 160, 200));
imagejpeg($img, $jpg, 85);
$fake = "{$work}/shell.jpg";
file_put_contents($fake, "<?php echo 'x';");
$upload = static fn (string $path, string $name): array => http('POST', "{$base}/admin/eventos/{$created['id']}/foto", [
    'cookie' => $cookie, 'headers' => ['Accept: application/json'],
    'body' => ['_csrf' => $csrf, 'photo' => new CURLFile($path, 'image/jpeg', $name)],
]);
[$status, , $body] = $upload($fake, 'shell.php');
check($status === 422 && str_contains($body, 'Formato no soportado'), 'a PHP file (even named .php) is refused by its content');
[$status, , $body] = $upload($jpg, 'foto.jpg');
$first = Db::one('SELECT image_url FROM events WHERE id = ?', [$created['id']])['image_url'];
check($status === 200 && preg_match('#^/uploads/events/' . $created['id'] . '/\d{14}-[0-9a-f]{12}\.jpg$#', (string) $first) === 1, "a JPEG is saved with a server-made name: {$first}");
[$status, $h] = http('GET', $base . $first);
check($status === 200 && str_starts_with($h['content-type'][0] ?? '', 'image/jpeg'), 'and it is served publicly as an image');
[, , $catalogHtml] = http('GET', "{$base}/eventos/{$created['id']}");
[, , $editHtml] = http('GET', "{$base}/admin/eventos/{$created['id']}", ['cookie' => $cookie]);
check(str_contains($editHtml, 'Foto guardada.') && str_contains($editHtml, e($first)), 'the edit page says "Foto guardada." and shows it');
[$status] = $upload($jpg, 'otra.jpg');
$second = Db::one('SELECT image_url FROM events WHERE id = ?', [$created['id']])['image_url'];
clearstatcache();
check($second !== $first && !is_file(ROOT_DIR . '/public' . $first) && is_file(ROOT_DIR . '/public' . $second), 'replacing it deletes the old file');
[$status] = http('POST', "{$base}/admin/eventos/{$created['id']}/foto/quitar", ['cookie' => $cookie, 'body' => http_build_query(['_csrf' => $csrf])]);
$afterRemove = Db::one('SELECT image_url FROM events WHERE id = ?', [$created['id']])['image_url'];
clearstatcache(); // PHP caches is_file() results; the server deleted it in another process
check($afterRemove === null && !is_file(ROOT_DIR . '/public' . $second), '"Quitar foto" clears it and deletes the file');
$sample = t_event($pdo, ['title' => 'Con foto de ejemplo']);
$createdEvents[] = $sample;
Db::run("UPDATE events SET image_url = '/img/Acuarelas.webp' WHERE id = ?", [$sample]);
http('POST', "{$base}/admin/eventos/{$sample}/foto", ['cookie' => $cookie, 'headers' => ['Accept: application/json'], 'body' => ['_csrf' => $csrf, 'photo' => new CURLFile($jpg, 'image/jpeg', 'f.jpg')]]);
check(is_file(ROOT_DIR . '/public/img/Acuarelas.webp'), 'replacing a sample photo never deletes the file in /img');
[$status] = http('POST', "{$base}/admin/eventos/{$created['id']}/foto", ['body' => ['_csrf' => $csrf, 'photo' => new CURLFile($jpg, 'image/jpeg', 'f.jpg')]]);
check($status === 307, 'without a session a photo upload answers 307');
array_map('unlink', glob("{$work}/*") ?: []);
@rmdir($work);

finish();
