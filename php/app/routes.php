<?php
/*
 * Every URL of the site. Paths mirror the Next.js version one to one, so links
 * shared before the migration keep working.
 */

declare(strict_types=1);

$router = new Router();

$router->get('/', static function (): void {
    respond('home');
});

return $router;
