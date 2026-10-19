<?php
/*
 * Builds the upload package for DonWeb:
 *
 *   php tools/make-deploy-zip.php            -> dist/casa-donweb-AAAAMMDD.zip
 *
 * The zip mirrors the hosting account's home folder:
 *
 *   public_html/   what the browser can reach (index.php, CSS, JS, images)
 *   app/           the code             \
 *   config/        config.example.php    |  OUTSIDE public_html: never
 *   database/      schema.sql            |  reachable by URL
 *   storage/       receipts, sessions,  /
 *                  logs (empty)
 *
 * It never packs config/config.php (credentials), receipts, sessions, logs,
 * uploaded event photos, tests or node_modules.
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$out = $argv[1] ?? $root . '/dist/casa-donweb-' . gmdate('Ymd') . '.zip';
@mkdir(dirname($out), 0755, true);
@unlink($out);

$zip = new ZipArchive();
if ($zip->open($out, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    fwrite(STDERR, "No se pudo crear {$out}\n");
    exit(1);
}

/** Adds every file under $dir (relative to $root) as $prefix/..., skipping $skip patterns. */
$addTree = static function (string $dir, string $prefix, array $skip = []) use ($zip, $root): int {
    $count = 0;
    $base = $root . '/' . $dir;
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) {
        $relative = substr($file->getPathname(), strlen($base) + 1);
        foreach ($skip as $pattern) {
            if (preg_match($pattern, $relative)) {
                continue 2;
            }
        }
        $zip->addFile($file->getPathname(), $prefix . '/' . $relative);
        $count++;
    }
    return $count;
};

$n = 0;
// Uploaded event photos stay on the server; only the folder and its guard ship.
$n += $addTree('public', 'public_html', ['#^uploads/events/(?!\.htaccess$|\.gitkeep$)#']);
$n += $addTree('app', 'app');
$zip->addFile($root . '/config/config.example.php', 'config/config.example.php');
$zip->addFile($root . '/database/schema.sql', 'database/schema.sql');
$zip->addFile($root . '/storage/.htaccess', 'storage/.htaccess');
foreach (['receipts', 'sessions', 'logs'] as $folder) {
    $zip->addFromString("storage/{$folder}/.gitkeep", '');
}
$zip->addFile($root . '/tools/check-hosting.php', 'tools/check-hosting.php');
$n += 6;
$zip->close();

echo "Listo: {$out} ({$n} archivos, " . round(filesize($out) / 1024) . " KB)\n";
