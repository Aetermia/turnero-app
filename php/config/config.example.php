<?php
/*
 * Copy this file to config/config.php and fill it in. config.php is ignored by
 * git: it holds the database password, the admin password hash and the
 * payment alias, none of which may ever reach the repository.
 *
 * On DonWeb this folder lives OUTSIDE public_html, next to app/ and storage/.
 */

return [
    // "production" turns on the Secure cookie flag and hides error details.
    // Use "development" only on your own computer.
    'env' => 'production',

    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'CHANGE_ME',
        'user' => 'CHANGE_ME',
        'password' => 'CHANGE_ME',
    ],

    // MercadoLibre alias shown on the payment step. Leave it empty to show a
    // neutral text instead ("al alias que te pasamos por WhatsApp").
    'payment_alias' => '',

    'admin' => [
        // The single admin user of the panel.
        'user' => 'admin',
        // Generate it with: php tools/hash-admin-password.php "your-password"
        // While it is empty the panel lets nobody in (it fails closed).
        'password_hash' => '',
    ],
];
