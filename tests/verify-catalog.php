<?php
/*
 * P4 — public catalog and event detail, over real HTTP against a real
 * database (equivalent to what T4 verified in the Next.js version):
 *   - published events render; the draft never appears in any response body
 *   - free seats drop when a live hold or a paid reservation exists
 *   - an EXPIRED hold, a rejected and a cancelled reservation do not count
 *   - detail: published 200; draft, missing and malformed ids 404 (noindex)
 *   - colors and dates match the JavaScript originals exactly
 *
 * Run: php tests/verify-catalog.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$base = start_test_server(write_test_config());
shell_exec('CASA_CONFIG_PATH=' . escapeshellarg(write_test_config()) . ' php ' . escapeshellarg(TEST_ROOT . '/database/seed.php'));

$events = $pdo->query('SELECT id, title, is_published, capacity FROM events')->fetchAll();
$byTitle = array_column($events, null, 'title');
$acuarela = $byTitle['Taller de acuarela para principiantes'];
$draft = $byTitle['Taller de cerámica (borrador)'];

/** "N de M lugares disponibles" inside the card for one event. */
function seats_in_card(string $html, string $eventId): ?string
{
    $start = strpos($html, '/eventos/' . $eventId . '"');
    if ($start === false) {
        return null;
    }
    $chunk = substr($html, $start, 6000);
    return preg_match('/(\d+ de \d+ lugares disponibles|Sin lugares disponibles)/', $chunk, $m) ? $m[1] : null;
}

echo "Catalog:\n";
[$status, , $home] = http('GET', $base . '/');
check($status === 200, 'GET / answers 200');
check(substr_count($home, 'Más información y reserva') === 3, 'the 3 published events render, each with its button');
check(!str_contains($home, 'cerámica') && !str_contains($home, $draft['id']), 'the draft is NOT in the response body (neither title nor id)');
check(str_contains($home, '/img/Acuarelas.webp') && str_contains($home, '/img/Escritura.webp'), 'the two sample photos are referenced');
check(substr_count($home, 'bg-coral-300') === 1, 'the event without a photo shows the coral color block instead');
check(seats_in_card($home, $acuarela['id']) === '12 de 12 lugares disponibles', 'baseline: "12 de 12 lugares disponibles"');
check(str_contains($home, 'Sábado') || str_contains($home, 'Domingo') || str_contains($home, 'Lunes')
    || str_contains($home, 'Martes') || str_contains($home, 'Miércoles') || str_contains($home, 'Jueves') || str_contains($home, 'Viernes'),
    'dates start with a capitalized weekday');
check(str_contains($home, '18 a 20 hs'), 'times read "18 a 20 hs"');
check(str_contains($home, "\$\u{00A0}15.000,00"), 'price reads "$ 15.000,00"');

$person = static fn (string $email): string => t_customer($pdo, $email);
$live = t_reservation($pdo, $acuarela['id'], $person('vivo@example.com'), 'pending_no_receipt', 'NOW() + INTERVAL 30 MINUTE');
[, , $home] = http('GET', $base . '/');
check(seats_in_card($home, $acuarela['id']) === '11 de 12 lugares disponibles', 'a LIVE hold takes a seat: 12 -> 11');

t_reservation($pdo, $acuarela['id'], $person('vencido@example.com'), 'pending_no_receipt', 'NOW() - INTERVAL 1 MINUTE');
t_reservation($pdo, $acuarela['id'], $person('sinfecha@example.com'), 'pending_no_receipt', null);
[, , $home] = http('GET', $base . '/');
check(seats_in_card($home, $acuarela['id']) === '11 de 12 lugares disponibles', 'an EXPIRED hold (and one with no deadline) does NOT take a seat: still 11');

t_reservation($pdo, $acuarela['id'], $person('revision@example.com'), 'pending_review');
t_reservation($pdo, $acuarela['id'], $person('aprobada@example.com'), 'approved');
t_reservation($pdo, $acuarela['id'], $person('rechazada@example.com'), 'rejected');
t_reservation($pdo, $acuarela['id'], $person('cancelada@example.com'), 'cancelled');
[, , $home] = http('GET', $base . '/');
check(seats_in_card($home, $acuarela['id']) === '9 de 12 lugares disponibles', 'pending_review and approved take seats, rejected and cancelled do not: 9');

$small = t_event($pdo, ['title' => 'Evento chico', 'capacity' => 1]);
t_reservation($pdo, $small, $person('lleno@example.com'), 'approved');
[, , $home] = http('GET', $base . '/');
check(seats_in_card($home, $small) === 'Sin lugares disponibles' && str_contains($home, 'Evento completo'), 'a full event reads "Sin lugares disponibles" / "Evento completo"');

$past = t_event($pdo, ['title' => 'Evento que ya pasó', 'starts_at' => gmdate('Y-m-d H:i:s', time() - 3600), 'ends_at' => gmdate('Y-m-d H:i:s', time() - 60)]);
[, , $home] = http('GET', $base . '/');
check(!str_contains($home, $past), 'an event that already started is not in the catalog');

echo "\nDetail:\n";
[$status, , $detail] = http('GET', $base . '/eventos/' . $acuarela['id']);
check($status === 200, 'a published event answers 200');
check(str_contains($detail, 'Volver al inicio') && str_contains($detail, 'href="/"'), 'it has the "Volver al inicio" link');
check(str_contains($detail, 'Una tarde para perderle el miedo al agua'), 'it shows the description');
check(str_contains($detail, '9 de 12') && str_contains($detail, 'Reservar mi lugar'), 'it shows live seats and the booking button');
[$status, , $body] = http('GET', $base . '/eventos/' . $draft['id']);
check($status === 404 && !str_contains($body, 'cerámica'), 'the DRAFT answers 404 and does not leak its title');
check(str_contains($body, 'noindex'), 'the 404 page is noindex');
[$status] = http('GET', $base . '/eventos/' . t_uuid());
check($status === 404, 'a well-formed but unknown id answers 404');
[$status] = http('GET', $base . '/eventos/not-a-uuid');
check($status === 404, 'a malformed id answers 404 (never 500)');
[$status, , $body] = http('GET', $base . '/eventos/' . $small);
check($status === 200 && str_contains($body, 'disabled') && str_contains($body, 'Este evento ya no tiene lugares disponibles.'), 'a full event shows a disabled button');

echo "\nParity with the JavaScript originals:\n";
$themes = ['Pintura', 'Escritura', 'Charla', 'Cerámica', 'Yoga', 'Música', 'Fotografía', 'Té y meditación', 'Huerta', ''];
$jsTones = json_decode((string) shell_exec('node -e ' . escapeshellarg(<<<'JS'
const KEYWORD_TONES=[[/pint|acuarel|arte|dibuj|cer[aá]mic|ilustr/,"celeste"],[/escrit|lectur|literat|poes|libro/,"salvia"],[/charla|cocin|t[eé]\b|merienda|brunch/,"coral"]];
const ORDER=["celeste","salvia","coral","arena"];
function tone(theme){const n=(theme??"").trim().toLowerCase();if(!n)return"arena";for(const[p,t]of KEYWORD_TONES)if(p.test(n))return t;let h=0;for(const c of n)h=(h*31+c.charCodeAt(0))>>>0;return ORDER[h%ORDER.length];}
console.log(JSON.stringify(process.argv.slice(1).map(tone)));
JS) . ' ' . implode(' ', array_map('escapeshellarg', $themes))), true);
// node drops the empty-string argument from argv when it is last; compare the rest
$phpTones = array_map(static fn (string $t): string => explode('-', explode(' ', ThemeTone::for($t)['placeholder'])[0])[1], $themes);
check(array_slice($phpTones, 0, count($jsTones)) === $jsTones, 'theme colors match theme-tone.ts for: ' . implode(', ', array_filter($themes)));

$instants = ['2026-10-21T21:00:00Z', '2026-12-31T23:30:00Z', '2027-01-01T02:59:00Z', '2026-03-01T03:00:00Z'];
$js = json_decode((string) shell_exec('node -e ' . escapeshellarg(<<<'JS'
const TZ="America/Argentina/Buenos_Aires";
const d=new Intl.DateTimeFormat("es-AR",{timeZone:TZ,weekday:"long",day:"numeric",month:"long"});
const dt=new Intl.DateTimeFormat("es-AR",{timeZone:TZ,day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
console.log(JSON.stringify(process.argv.slice(1).map(s=>{const x=new Date(s);return [d.format(x).replace(",",""), dt.format(x)];})));
JS) . ' ' . implode(' ', $instants)), true);
$php = array_map(static function (string $iso): array {
    $utc = (new DateTimeImmutable($iso))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    return [Format::eventDate($utc), Format::dateTime($utc)];
}, $instants);
check($php === $js, 'eventDate / dateTime equal Intl es-AR, including New Year\'s Eve crossing to Jan 1 in UTC');
if ($php !== $js) {
    var_dump($php, $js);
}

finish();
