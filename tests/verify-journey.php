<?php
/*
 * P13 — the whole journey over HTTP only, as the customer and the owner live
 * it, plus the parity fixes found in the side-by-side review:
 *   customer: catalog -> event -> form -> held seat -> receipt -> transfer
 *             data -> "en revision"
 *   owner:    login -> reservation in the list -> detail with health data,
 *             receipt and WhatsApp -> approve -> customer page "confirmada"
 *             -> client list and CSV (no health data)
 *   second customer: same email again -> rejected; owner rejects another
 *             person -> seat freed -> somebody else books the last seat
 * Every step goes through the site. The only database write by hand moves
 * one hold's deadline back, to stand in for 30 minutes of waiting.
 *
 * Run: php tests/verify-journey.php
 */

declare(strict_types=1);

require __DIR__ . '/lib/harness.php';
require __DIR__ . '/../app/bootstrap.php';

$pdo = reset_test_database();
$s = test_db_settings();
Db::use(Db::connect("mysql:host={$s['host']};port={$s['port']};dbname={$s['name']};charset=utf8mb4", $s['user'], $s['password']));
$password = 'clave-del-panel-larga';
$base = start_test_server(write_test_config(['payment_alias' => 'casa.de.anton.mp', 'admin' => ['user' => 'duena', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)]]));
$work = sys_get_temp_dir() . '/casa-journey-' . bin2hex(random_bytes(4));
mkdir($work);
$jpeg = "{$work}/comprobante.jpg";
$img = imagecreatetruecolor(900, 1200);
imagefilledrectangle($img, 0, 0, 900, 1200, imagecolorallocate($img, 240, 240, 250));
imagejpeg($img, $jpeg, 85);
$createdReceipts = [];
register_shutdown_function(static function () use ($work, &$createdReceipts): void {
    array_map('unlink', glob("{$work}/*") ?: []);
    @rmdir($work);
    foreach ($createdReceipts as $id) {
        array_map('unlink', glob(Receipts::directory() . "/{$id}/*") ?: []);
        @rmdir(Receipts::directory() . "/{$id}");
    }
});

/** A browser-like visitor: keeps its own cookie. */
final class Visitor
{
    public string $cookie = '';
    public function __construct(private string $base) {}
    public function get(string $path): array
    {
        return $this->keep(http('GET', $this->base . $path, $this->cookie !== '' ? ['cookie' => $this->cookie] : []));
    }
    public function post(string $path, array|string $body, array $headers = []): array
    {
        return $this->keep(http('POST', $this->base . $path, ['cookie' => $this->cookie, 'body' => $body, 'headers' => $headers]));
    }
    private function keep(array $response): array
    {
        foreach ($response[1]['set-cookie'] ?? [] as $c) {
            $this->cookie = explode(';', $c)[0];
        }
        return $response;
    }
}
$csrfOf = static fn (string $html): string => preg_match('/name="_csrf" value="([a-f0-9]+)"/', $html, $m) ? $m[1] : '';

// The owner creates the event from the panel (no seed, no SQL).
$owner = new Visitor($base);
[, , $html] = $owner->get('/admin/login');
$owner->post('/admin/login', http_build_query(['_csrf' => $csrfOf($html), 'username' => 'duena', 'password' => $password]));
[, , $html] = $owner->get('/admin/eventos/nuevo');
[$code] = $owner->post('/admin/eventos/nuevo', http_build_query(['_csrf' => $csrfOf($html), 'title' => 'Té y acuarelas', 'theme' => 'Pintura',
    'description' => 'Una tarde de color.', 'location' => 'Salón principal', 'startsAt' => '2026-12-12T17:00', 'endsAt' => '2026-12-12T19:30',
    'capacity' => '2', 'price' => '28000', 'isPublished' => 'on']));
$eventId = (string) Db::one("SELECT id FROM events WHERE title = 'Té y acuarelas'")['id'];
check($code === 303 && $eventId !== '', 'owner: creates "Té y acuarelas" (2 seats, $ 28.000) from the panel');

echo "\nCustomer journey:\n";
$ana = new Visitor($base);
[$code, , $html] = $ana->get('/');
check($code === 200 && str_contains($html, 'Té y acuarelas') && str_contains($html, "/eventos/{$eventId}"), 'the catalog lists the event');
[$code, , $html] = $ana->get("/eventos/{$eventId}");
check($code === 200 && str_contains($html, 'Sábado 12 de diciembre') && str_contains($html, '17 a 19:30 hs') && str_contains($html, "\$\u{00A0}28.000,00"), 'event page: date, time range and price in Buenos Aires time');
[, , $html] = $ana->get("/eventos/{$eventId}/reservar");
$booking = ['_csrf' => $csrfOf($html), 'fullName' => 'Ana Gómez', 'email' => 'Ana.Gomez@Example.com', 'whatsapp' => '2494 31-0000',
    'hasHealthCondition' => 'yes', 'healthCondition' => 'Celiaquía (CONDICION-SECRETA)', 'marketingConsent' => 'on'];
[$code, $h] = $ana->post("/eventos/{$eventId}/reservar", http_build_query($booking));
$statusPath = $h['location'][0] ?? '';
check($code === 303 && preg_match('#^/reservas/[A-Za-z0-9_-]{43}$#', $statusPath) === 1, 'booking -> 303 to her private status page');
[, , $html] = $ana->get($statusPath);
check(str_contains($html, 'Te guardamos el lugar') && str_contains($html, 'casa.de.anton.mp') && !str_contains($html, 'CONDICION-SECRETA'), 'status page: seat held, payment alias, no health data');
$csrf = $csrfOf($html);
[$code, , $body] = $ana->post("{$statusPath}/comprobante", ['_csrf' => $csrf, 'receipt' => new CURLFile($jpeg, 'image/jpeg', 'comprobante.jpg')], ['Accept: application/json']);
check($code === 200 && json_decode($body, true) === ['ok' => true], 'receipt upload -> ok');
$reservationId = (string) Db::one('SELECT id FROM reservations WHERE public_token = ?', [substr($statusPath, 10)])['id'];
$createdReceipts[] = $reservationId;
[, , $html] = $ana->get($statusPath);
check(str_contains($html, 'Comprobante subido') || str_contains($html, 'transferHolder'), 'the page now asks for the transfer data');
[$code, $h] = $ana->post("{$statusPath}/confirmar", http_build_query(['_csrf' => $csrf, 'transferHolder' => 'Ana Gómez', 'transferAmount' => '28000,00',
    'transferDate' => '2026-10-19', 'transferReference' => 'MP-55120']));
[, , $html] = $ana->get($statusPath);
check($code === 303 && str_contains($html, 'Tu reserva está en revisión') && str_contains($html, 'MP-55120'), 'transfer data -> "Tu reserva está en revisión"');
[, , $body] = $ana->post("{$statusPath}/comprobante", ['_csrf' => $csrf, 'receipt' => new CURLFile($jpeg, 'image/jpeg', 'otra.jpg')], ['Accept: application/json']);
check((json_decode($body, true)['error'] ?? '') === 'Ya se subió el comprobante para esta reserva', 'uploading again after confirming -> "Ya se subió el comprobante para esta reserva" (original wording)');
[$code] = $ana->get("/admin/reservas/{$reservationId}/comprobante");
check($code === 307, 'the customer cannot open the receipt URL of the panel');

echo "\nThe same person again, and a second customer:\n";
$again = new Visitor($base);
[, , $html] = $again->get("/eventos/{$eventId}/reservar");
[$code, , $html] = $again->post("/eventos/{$eventId}/reservar", http_build_query(['_csrf' => $csrfOf($html), 'email' => 'ana.gomez@example.com', 'hasHealthCondition' => 'no'] + $booking));
check($code === 422 && str_contains($html, 'Ya tenés una reserva para este evento.'), 'same email (other case) -> "Ya tenés una reserva para este evento"');
$beto = new Visitor($base);
[, , $html] = $beto->get("/eventos/{$eventId}/reservar");
[$code, $h] = $beto->post("/eventos/{$eventId}/reservar", http_build_query(['_csrf' => $csrfOf($html), 'fullName' => 'Beto Ruiz', 'email' => 'beto@example.com',
    'whatsapp' => '2494 31-1111', 'hasHealthCondition' => 'no']));
$betoPath = $h['location'][0] ?? '';
check($code === 303, 'Beto takes the second (last) seat');
$cami = new Visitor($base);
[, , $html] = $cami->get("/eventos/{$eventId}/reservar");
$camiForm = ['_csrf' => $csrfOf($html), 'fullName' => 'Cami Sosa', 'email' => 'cami@example.com', 'whatsapp' => '2494 31-2222', 'hasHealthCondition' => 'no'];
[$code, , $html] = $cami->post("/eventos/{$eventId}/reservar", http_build_query($camiForm));
check($code === 422 && str_contains($html, 'Se agotaron los lugares para este evento.'), 'Cami: sold out');

echo "\nOwner:\n";
[, , $html] = $owner->get('/admin/reservas');
check(str_contains($html, 'Ana Gómez') && str_contains($html, 'En revisión') && str_contains($html, 'con comprobante') && !str_contains($html, 'CONDICION-SECRETA'), 'list: Ana "En revisión", with receipt, no health data');
[, , $html] = $owner->get("/admin/reservas/{$reservationId}");
check(str_contains($html, 'CONDICION-SECRETA') && str_contains($html, 'MP-55120') && str_contains($html, "/admin/reservas/{$reservationId}/comprobante") && str_contains($html, 'https://wa.me/542494310000?text='), 'detail: health data, transfer data, receipt and WhatsApp button');
[$code, $h, $bytes] = $owner->get("/admin/reservas/{$reservationId}/comprobante");
check($code === 200 && ($h['content-type'][0] ?? '') === 'image/jpeg' && $bytes === file_get_contents($jpeg), 'the owner opens the receipt (same bytes)');
[$code] = $owner->post("/admin/reservas/{$reservationId}/aprobar", http_build_query(['_csrf' => $csrfOf($html)]));
[, , $page] = $ana->get($statusPath);
check($code === 303 && str_contains($page, 'Tu reserva está confirmada'), 'approve -> Ana sees "Tu reserva está confirmada"');
[, , $html] = $owner->get('/admin/eventos');
check(str_contains($html, '2 de 2 lugares ocupados'), 'approving keeps the count: 2 of 2 occupied');

$betoId = (string) Db::one('SELECT id FROM reservations WHERE public_token = ?', [substr($betoPath, 10)])['id'];
[, , $html] = $owner->get("/admin/reservas/{$betoId}");
check(!str_contains($html, 'Aprobar reserva') && str_contains($html, 'Solo las reservas en revisión se pueden aprobar o rechazar.'), 'Beto has not paid yet: nothing to approve or reject');
Db::run('UPDATE reservations SET expires_at = NOW() - INTERVAL 1 SECOND WHERE id = ?', [$betoId]); // the 30 minutes pass
[, , $page] = $beto->get($betoPath);
check(str_contains($page, 'El plazo venció'), '30 minutes later Beto\'s page says "El plazo venció"');
[, , $html] = $cami->get("/eventos/{$eventId}/reservar");
[$code] = $cami->post("/eventos/{$eventId}/reservar", http_build_query(['_csrf' => $csrfOf($html)] + $camiForm));
check($code === 303, 'and Cami now gets the freed seat');

echo "\nClients and CSV:\n";
[, , $html] = $owner->get('/admin/clientes');
check(str_contains($html, 'ana.gomez@example.com') && str_contains($html, 'Beto Ruiz') && str_contains($html, 'sin consentimiento'), 'client list: Ana with email (consent), Beto "sin consentimiento"');
[$code, $h, $csv] = $owner->get('/admin/clientes/export');
check($code === 200 && str_starts_with($csv, "\u{FEFF}") && str_contains($csv, '"Ana Gómez","ana.gomez@example.com"') && !str_contains($csv, 'CONDICION') && !str_contains($csv, 'Celiaqu'), 'CSV: Ana present, NO health data');

echo "\nParity fixes from the side-by-side review:\n";
$v = Validation::event(['title' => 'X', 'startsAt' => '2026-13-01T10:00', 'endsAt' => '2026-02-30T10:00']);
check(($v['errors']['startsAt'] ?? '') === 'La fecha no es válida' && ($v['errors']['endsAt'] ?? '') === 'La fecha no es válida', 'a well-formed but nonexistent date -> "La fecha no es válida" (and February 30 is rejected, not rolled over)');
check(($v['errors']['capacity'] ?? '') === 'Ingresá la capacidad' && ($v['errors']['price'] ?? '') === 'Ingresá el precio', 'missing capacity / price fields -> "Ingresá la capacidad" / "Ingresá el precio"');
$v = Validation::event(['title' => 'X', 'startsAt' => '', 'endsAt' => 'mañana', 'capacity' => 'diez', 'price' => '']);
check($v['errors']['startsAt'] === 'Completá la fecha y hora de inicio' && $v['errors']['endsAt'] === 'Completá la fecha y hora de fin' && $v['errors']['capacity'] === 'Ingresá un número entero' && $v['errors']['price'] === 'Ingresá un precio válido (por ejemplo 15000 o 15000,50)', 'the other messages stay as they were');

finish();
