<?php
/*
 * Development seed: the same four events as src/db/seed.ts (three published,
 * one draft), with the two sample photos. Idempotent and non-destructive: it
 * does nothing if the events table already has rows.
 *
 * Run: php database/seed.php
 */

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

/** "In N days at HH:00 Buenos Aires time", as a UTC DATETIME string. */
function at_hour_in_days(int $days, int $hour): string
{
    $local = new DateTimeImmutable('now', new DateTimeZone(Format::TIMEZONE));
    $local = $local->modify("+{$days} days")->setTime($hour, 0);
    return $local->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

$events = [
    [
        'title' => 'Taller de acuarela para principiantes',
        'theme' => 'Pintura',
        'description' => 'Una tarde para perderle el miedo al agua y al color. Incluye todos los materiales.',
        'image_url' => '/img/Acuarelas.webp',
        'location' => 'Salón principal',
        'starts_at' => at_hour_in_days(7, 18),
        'ends_at' => at_hour_in_days(7, 20),
        'capacity' => 12,
        'price' => '15000.00',
        'is_published' => 1,
    ],
    [
        'title' => 'Círculo de escritura creativa',
        'theme' => 'Escritura',
        'description' => 'Ejercicios disparadores y lectura en voz alta. No hace falta experiencia previa.',
        'image_url' => '/img/Escritura.webp',
        'location' => 'Sala de lectura',
        'starts_at' => at_hour_in_days(12, 19),
        'ends_at' => at_hour_in_days(12, 21),
        'capacity' => 10,
        'price' => '12000.00',
        'is_published' => 1,
    ],
    [
        'title' => 'Charla: cocina sin TACC en casa',
        'theme' => 'Charla',
        'description' => 'Contaminación cruzada, compras seguras y recetas simples para todos los días.',
        'image_url' => null,
        'location' => 'Salón principal',
        'starts_at' => at_hour_in_days(20, 18),
        'ends_at' => at_hour_in_days(20, 20),
        'capacity' => 25,
        'price' => '8000.00',
        'is_published' => 1,
    ],
    [
        'title' => 'Taller de cerámica (borrador)',
        'theme' => 'Cerámica',
        'description' => 'Evento de ejemplo sin publicar, para probar que no aparece en el catálogo.',
        'image_url' => null,
        'location' => 'Taller',
        'starts_at' => at_hour_in_days(30, 17),
        'ends_at' => at_hour_in_days(30, 20),
        'capacity' => 8,
        'price' => '20000.00',
        'is_published' => 0,
    ],
];

if (Db::one('SELECT id FROM events LIMIT 1') !== null) {
    echo "Seed skipped: the events table already has rows.\n";
    exit(0);
}

Db::transaction(static function (PDO $pdo) use ($events): void {
    $insert = $pdo->prepare(
        'INSERT INTO events (id, title, theme, description, image_url, location, starts_at, ends_at, capacity, price, is_published)
         VALUES (:id, :title, :theme, :description, :image_url, :location, :starts_at, :ends_at, :capacity, :price, :is_published)'
    );
    foreach ($events as $event) {
        $insert->execute(['id' => uuid_v4()] + $event);
    }
});

echo 'Seed complete: ' . count($events) . " events inserted.\n";
foreach ($events as $event) {
    echo '  - ' . $event['title'] . ($event['is_published'] ? '' : ' (draft)') . "\n";
}
