<?php

declare(strict_types=1);

/*
 * Booking flow, step 1: the form and its submission. A draft, a missing event
 * or one that already started cannot be reserved (404).
 */
final class BookingController
{
    /** @param array<string, string> $params */
    public static function form(array $params): void
    {
        $event = self::bookableEvent($params['id']);
        respond('reserve', [
            'event' => $event,
            'errors' => [],
            'old' => [],
            'formError' => null,
            'title' => 'Completá tus datos',
            'noindex' => true,
        ]);
    }

    /** @param array<string, string> $params */
    public static function submit(array $params): void
    {
        Csrf::verifyOrFail();
        $event = self::bookableEvent($params['id']);

        $validation = Validation::reservation($_POST);
        $old = array_map(
            static fn ($v): string => is_string($v) ? $v : '',
            array_intersect_key($_POST, array_flip(['fullName', 'email', 'whatsapp', 'hasHealthCondition', 'healthCondition', 'marketingConsent'])),
        );

        if ($validation['errors'] !== []) {
            self::rerender($event, $validation['errors'], $old, null);
            return;
        }

        $result = Reservations::create($event['id'], $validation['values']);
        if (!$result['ok']) {
            $message = match ($result['reason']) {
                'sold_out' => 'Se agotaron los lugares para este evento. Podés probar con otro encuentro.',
                'already_reserved' => 'Ya tenés una reserva para este evento. Revisá el enlace que te dio el sistema al reservar.',
                default => 'Este evento ya no está disponible para reservar.',
            };
            self::rerender($event, [], $old, $message);
            return;
        }

        // Post/Redirect/Get: a reload of the next page never re-submits.
        redirect('/reservas/' . $result['token']);
    }

    /** @return array<string, mixed> */
    private static function bookableEvent(string $id): array
    {
        $event = Events::publishedById($id);
        if ($event === null || !Events::hasNotStarted($event)) {
            not_found();
        }
        return $event;
    }

    /**
     * @param array<string, mixed> $event
     * @param array<string, string> $errors
     * @param array<string, string> $old
     */
    private static function rerender(array $event, array $errors, array $old, ?string $formError): void
    {
        respond('reserve', [
            'event' => $event,
            'errors' => $errors,
            'old' => $old,
            'formError' => $formError,
            'title' => 'Completá tus datos',
            'noindex' => true,
        ], 422);
    }
}
