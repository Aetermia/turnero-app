<?php
/*
 * Hosting check. Upload this single file to public_html, open it in the
 * browser (https://your-domain/check-hosting.php) and read the result. DELETE
 * IT afterwards: it reveals the PHP and database versions.
 *
 * Optionally it also tests the database: fill in the four values below with
 * the database created in the hosting panel. Leave them empty to skip that part.
 *
 * Written on purpose in old PHP syntax (5.4+): its job is to REPORT an old
 * PHP version, so it must not crash on one before printing anything.
 */

// Show problems on screen instead of a blank "error 500" page.
ini_set('display_errors', '1');
error_reporting(E_ALL);

$db = [
    'host' => 'localhost',
    'name' => '',
    'user' => '',
    'password' => '',
];

$checks = array();

function bytes_from_ini($value)
{
    $value = trim((string) $value);
    $unit = strtolower(substr($value, -1));
    $number = (int) $value;
    if ($unit === 'g') {
        return $number * 1024 * 1024 * 1024;
    }
    if ($unit === 'm') {
        return $number * 1024 * 1024;
    }
    if ($unit === 'k') {
        return $number * 1024;
    }
    return $number;
}

$checks[] = array('PHP 8.1 o superior', version_compare(PHP_VERSION, '8.1.0', '>='), 'Versión: ' . PHP_VERSION);
foreach (array('pdo_mysql', 'fileinfo', 'mbstring', 'json', 'session') as $extension) {
    $checks[] = array("Extensión {$extension}", extension_loaded($extension), extension_loaded($extension) ? 'instalada' : 'FALTA');
}

$minUpload = 9 * 1024 * 1024; // an 8 MB PDF plus the form fields
$upload = (string) ini_get('upload_max_filesize');
$post = (string) ini_get('post_max_size');
$checks[] = array('upload_max_filesize de 9 MB o más', bytes_from_ini($upload) >= $minUpload, 'Valor: ' . $upload);
$checks[] = array('post_max_size de 9 MB o más', bytes_from_ini($post) >= $minUpload, 'Valor: ' . $post);
$checks[] = array('file_uploads activado', (bool) ini_get('file_uploads'), ini_get('file_uploads') ? 'sí' : 'no');

$parent = dirname(dirname(__FILE__));
$checks[] = array(
    'Se puede escribir fuera de public_html (para comprobantes)',
    is_writable($parent),
    $parent
);

if ($db['name'] !== '' && $db['user'] !== '') {
    try {
        $pdo = new PDO(
            "mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4",
            $db['user'],
            $db['password'],
            array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION)
        );
        $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
        $isMaria = stripos($version, 'mariadb') !== false;
        $numeric = (string) preg_replace('/[^0-9.].*$/', '', $version);
        $ok = $isMaria ? version_compare($numeric, '10.2.0', '>=') : version_compare($numeric, '5.7.8', '>=');
        $checks[] = array('MySQL 5.7.8+ o MariaDB 10.2+', $ok, 'Versión: ' . $version);

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
        } catch (PDOException $duplicate) {
            $blocked = true;
        }
        $checks[] = array('Columna generada con índice único (regla "una reserva activa")', $blocked, $blocked ? 'funciona' : 'NO bloquea duplicados');
        $engines = $pdo->query("SELECT SUPPORT FROM information_schema.ENGINES WHERE ENGINE = 'InnoDB'")->fetchColumn();
        $checks[] = array('Motor InnoDB (transacciones y FOR UPDATE)', in_array($engines, array('YES', 'DEFAULT'), true), 'Soporte: ' . (string) $engines);
    } catch (Exception $error) {
        $checks[] = array('Conexión a la base de datos', false, $error->getMessage());
    }
}

$allOk = true;
foreach ($checks as $check) {
    if (!$check[1]) {
        $allOk = false;
    }
}
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
<?php foreach ($checks as $check): list($label, $ok, $detail) = $check; ?>
<tr><td><?= htmlspecialchars($label) ?></td><td class="<?= $ok ? 'ok' : 'no' ?>"><?= $ok ? 'OK' : 'NO' ?></td><td><?= htmlspecialchars($detail) ?></td></tr>
<?php endforeach; ?>
</table>
<p><strong>Importante:</strong> borrá este archivo del servidor cuando termines.</p>
</body>
</html>
