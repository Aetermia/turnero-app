<?php

declare(strict_types=1);

/*
 * Public status page reached only with the secret token. Completed in P6
 * (payment step) and P10 (every state).
 */
final class ReservationController
{
    /** @param array<string, string> $params */
    public static function show(array $params): void
    {
        $token = $params['token'];
        if (!Reservations::isWellFormedToken($token)) {
            not_found();
        }
        $reservation = Db::one(
            'SELECT r.public_token, e.title AS event_title
             FROM reservations r JOIN events e ON e.id = r.event_id
             WHERE r.public_token = ?',
            [$token],
        );
        if ($reservation === null) {
            not_found();
        }
        respond('reservation', ['reservation' => $reservation, 'title' => 'Tu reserva', 'noindex' => true]);
    }
}
