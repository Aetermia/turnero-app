<?php
/*
 * Hosting check. Upload this single file to public_html, open it in the
 * browser (https://your-domain/check-hosting.php) and read the result. DELETE
 * IT afterwards: it reveals the PHP and database versions.
 *
 * Optionally it also tests the database: fill in the four values below with
 * the database created in cPanel. Leave them empty to skip that part.
 */

declare(strict_types=1);

$db = [
    'host' => 'localhost',
    'name' => '',
    'user' => '',
    'password' => '',
];

/** @var list<array{string, bool, string}> $checks */
$checks = [];

function bytes_from_ini(string $value): int
{
    $value = trim($value);
    $unit = strtolower(substr($value, -1));
    $number = (int) $value;
    return match ($unit) {
        'g' => $number * 1024 ** 3,
        'm' => $number * 1024 ** 2,
        'k' => $number * 1024,
        default => (int) $value,
    };
}

$checks[] = ['PHP 8.1 o superior', version_compare(PHP_VERSION, '8.1.0', '>='), 'Versión: ' . PHP_VERSION];
foreach (['pdo_mysql', 'fileinfo', 'mbstring', 'json', 'session'] as $extension) {
    $checks[] = ["Extensión {$extension}", extension_loaded($extension), extension_loaded($extension) ? 'instalada' : 'FALTA'];
}

$minUpload = 9 * 1024 ** 2; // an 8 MB PDF plus the form fields
$upload = (string) ini_get('upload_max_filesize');
$post = (string) ini_get('post_max_size');
$checks[] = ['upload_max_filesize de 9 MB o más', bytes_from_ini($upload) >= $minUpload, 'Valor: ' . $upload];
$checks[] = ['post_max_size de 9 MB o más', bytes_from_ini($post) >= $minUpload, 'Valor: ' . $post];
$checks[] = ['file_uploads activado', (bool) ini_get('file_uploads'), ini_get('file_uploads') ? 'sí' : 'no'];

$parent = dirname(__DIR__);
$checks[] = [
    'Se puede escribir fuera de public_html (para comprobantes)',
    is_writable($parent),
    $parent,
];

if ($db['name'] !== '' && $db['user'] !== '') {
    try {
        $pdo = new PDO(
            "mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4",
            $db['user'],
            $db['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
        );
        $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
        $isMaria = stripos($version, 'mariadb') !== false;
        $numeric = preg_replace('/[^0-9.].*$/', '', $version) ?? '0';
        $ok = $isMaria ? version_compare($numeric, '10.2.0', '>=') : version_compare($numeric, '5.7.8', '>=');
        $checks[] = ['MySQL 5.7.8+ o MariaDB 10.2+', $ok, 'Versión: ' . $version];

        // The one-active-reservation rule needs a unique index on a generated
        // column. Try it for real on a temporary table.
        // VARCHAR, not CHAR: MariaDB rejects generated expressions over CHAR
        // columns because their value depends on PAD_CHAR_TO_FULL_LENGTH.
        $pdo->exec("CREATE TEMPORARY TABLE casa_check (
            status VARCHAR(20) NOT NULL,
            person VARCHAR(36) NOT NULL,
            active_person VARCHAR(36) AS (CASE WHEN status = 'active' THEN person END) STORED,
            UNIQUE KEY casa_check_unique (active_person)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("INSERT INTO casa_check (status, person) VALUES ('active', 'a'), ('done', 'a'), ('done', 'a')");
        $blocked = false;
        try {
            $pdo->exec("INSERT INTO casa_check (status, person) VALUES ('active', 'a')");
        } catch (PDOException) {
            $blocked = true;
        }
        $checks[] = ['Columna generada con índice único (regla "una reserva activa")', $blocked, $blocked ? 'funciona' : 'NO bloquea duplicados'];
        $engines = $pdo->query("SELECT SUPPORT FROM information_schema.ENGINES WHERE ENGINE = 'InnoDB'")->fetchColumn();
        $checks[] = ['Motor InnoDB (transacciones y FOR UPDATE)', in_array($engines, ['YES', 'DEFAULT'], true), 'Soporte: ' . (string) $engines];
    } catch (Throwable $error) {
        $checks[] = ['Conexión a la base de datos', false, $error->getMessage()];
    }
}

$allOk = !in_array(false, array_column($checks, 1), true);
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chequeo de hosting</title>
<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b2130}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:.5rem}.ok{color:#2f7a3b;font-weight:600}.no{color:#b3261e;font-weight:600}</style></head>
<body>
<h1>Chequeo de hosting — Casa de Antón</h1>
<p class="<?= $allOk ? 'ok' : 'no' ?>"><?= $allOk ? 'Todo listo: el hosting cumple con lo necesario.' : 'Hay puntos que no se cumplen (en rojo). Pasale esta pantalla al equipo de desarrollo.' ?></p>
<table>
<?php foreach ($checks as [$label, $ok, $detail]): ?>
<tr><td><?= htmlspecialchars($label) ?></td><td class="<?= $ok ? 'ok' : 'no' ?>"><?= $ok ? 'OK' : 'NO' ?></td><td><?= htmlspecialchars($detail) ?></td></tr>
<?php endforeach; ?>
</table>
<p><strong>Importante:</strong> borrá este archivo del servidor cuando termines.</p>
</body>
</html>
