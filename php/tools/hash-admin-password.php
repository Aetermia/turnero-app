<?php
/*
 * Prints the value for 'password_hash' in config/config.php.
 *
 *   php tools/hash-admin-password.php "the-panel-password"
 *
 * Without a terminal (shared hosting): run it on your own computer and paste
 * the printed line into config.php on the server.
 */

declare(strict_types=1);

$password = $argv[1] ?? '';
if ($password === '') {
    fwrite(STDERR, "Usage: php tools/hash-admin-password.php \"the-panel-password\"\n");
    exit(1);
}
if (strlen($password) < 10) {
    fwrite(STDERR, "Use at least 10 characters for the panel password.\n");
    exit(1);
}
echo "'password_hash' => '" . password_hash($password, PASSWORD_DEFAULT) . "',\n";
