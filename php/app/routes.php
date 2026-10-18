<?php
/*
 * Every URL of the site. Paths mirror the Next.js version one to one, so links
 * shared before the migration keep working.
 */

declare(strict_types=1);

$router = new Router();

$router->get('/', PublicController::home(...));
$router->get('/eventos/{id}', PublicController::event(...));
$router->get('/eventos/{id}/reservar', BookingController::form(...));
$router->post('/eventos/{id}/reservar', BookingController::submit(...));
$router->get('/reservas/{token}', ReservationController::show(...));
$router->post('/reservas/{token}/comprobante', ReservationController::upload(...));
$router->post('/reservas/{token}/confirmar', ReservationController::confirm(...));

// Admin panel. /admin/login is the only panel URL reachable without a session.
$router->get('/admin/login', AdminController::loginForm(...));
$router->post('/admin/login', AdminController::login(...));
$router->post('/admin/logout', AdminController::logout(...));
$router->get('/admin', AdminController::dashboard(...));
$router->get('/admin/eventos', AdminEventsController::index(...));
$router->get('/admin/eventos/nuevo', AdminEventsController::newForm(...));
$router->post('/admin/eventos/nuevo', AdminEventsController::create(...));
$router->get('/admin/eventos/{id}', AdminEventsController::editForm(...));
$router->post('/admin/eventos/{id}', AdminEventsController::update(...));
$router->post('/admin/eventos/{id}/publicar', AdminEventsController::publish(...));
$router->post('/admin/eventos/{id}/foto', AdminEventsController::uploadPhoto(...));
$router->post('/admin/eventos/{id}/foto/quitar', AdminEventsController::removePhoto(...));
$router->get('/admin/reservas', AdminReservationsController::index(...));
$router->get('/admin/reservas/{id}', AdminReservationsController::show(...));
$router->post('/admin/reservas/{id}/aprobar', AdminReservationsController::approve(...));
$router->post('/admin/reservas/{id}/rechazar', AdminReservationsController::reject(...));
$router->get('/admin/reservas/{id}/comprobante', AdminReservationsController::receipt(...));

return $router;
