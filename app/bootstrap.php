<?php
/*
 * Loaded by public/index.php and by every CLI script. It wires the error
 * handling, the configuration and the small set of helpers the app runs on.
 * Nothing here talks to the database yet: the connection is opened lazily, the
 * first time a page needs it.
 */

declare(strict_types=1);

define('ROOT_DIR', dirname(__DIR__));
define('APP_DIR', ROOT_DIR . '/app');
define('STORAGE_DIR', ROOT_DIR . '/storage');

require APP_DIR . '/lib/helpers.php';
// Every other library file is a single class with no side effects, so loading
// them all keeps the list from drifting as files are added.
foreach (glob(APP_DIR . '/lib/*.php') ?: [] as $file) {
    require_once $file;
}

foreach (glob(APP_DIR . '/domain/*.php') ?: [] as $file) {
    require $file;
}
foreach (glob(APP_DIR . '/controllers/*.php') ?: [] as $file) {
    require $file;
}

// Dates are stored in UTC and shown in Buenos Aires time (see Format.php), so
// PHP's own clock must not drift into a server-specific zone.
date_default_timezone_set('UTC');

Config::load(getenv('CASA_CONFIG_PATH') ?: ROOT_DIR . '/config/config.php');

error_reporting(E_ALL);
ini_set('display_errors', Config::isProduction() ? '0' : '1');
ini_set('log_errors', '1');
ini_set('error_log', STORAGE_DIR . '/logs/php-error.log');
