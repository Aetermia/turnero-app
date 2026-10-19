<?php

declare(strict_types=1);

/*
 * Panel: events (port of src/app/admin/(panel)/eventos). Every action checks
 * the admin session itself and every POST checks CSRF: an action is an
 * endpoint anyone can call, whatever page it was meant for.
 */
final class AdminEventsController
{
    public static function index(): void
    {
        $user = Auth::requireAdmin();
        admin_respond('admin/events/index', ['events' => EventsAdmin::all(), 'notice' => null, 'title' => 'Eventos'], $user);
    }

    public static function newForm(): void
    {
        $user = Auth::requireAdmin();
        admin_respond('admin/events/new', self::formData('/admin/eventos/nuevo', 'Crear evento', []), $user);
    }

    public static function create(): void
    {
        $user = Auth::requireAdmin();
        Csrf::verifyOrFail();
        $validation = Validation::event($_POST);
        if ($validation['errors'] !== []) {
            admin_respond('admin/events/new', self::formData('/admin/eventos/nuevo', 'Crear evento', self::posted(), $validation['errors']), $user, false, 422);
            return;
        }
        EventsAdmin::create($validation['values']);
        redirect('/admin/eventos');
    }

    /** @param array<string, string> $params */
    public static function editForm(array $params): void
    {
        $user = Auth::requireAdmin();
        $event = EventsAdmin::find($params['id']) ?? not_found();
        self::renderEdit($user, $event, self::valuesFromEvent($event));
    }

    /** @param array<string, string> $params */
    public static function update(array $params): void
    {
        $user = Auth::requireAdmin();
        Csrf::verifyOrFail();
        $event = EventsAdmin::find($params['id']) ?? not_found();
        $validation = Validation::event($_POST);
        if ($validation['errors'] !== []) {
            self::renderEdit($user, $event, self::posted(), $validation['errors'], null, 422);
            return;
        }
        $result = EventsAdmin::update($event['id'], $validation['values']);
        if (!$result['ok']) {
            $message = $result['reason'] === 'capacity_below_occupied'
                ? 'No podés bajar la capacidad por debajo de los lugares ya ocupados.'
                : 'El evento ya no existe.';
            self::renderEdit($user, EventsAdmin::find($event['id']) ?? $event, self::posted(), [], $message, 422);
            return;
        }
        redirect('/admin/eventos');
    }

    /** @param array<string, string> $params */
    public static function publish(array $params): void
    {
        Auth::requireAdmin();
        Csrf::verifyOrFail();
        EventsAdmin::setPublished($params['id'], ($_POST['publish'] ?? '') === 'true');
        redirect('/admin/eventos');
    }

    /** @param array<string, string> $params */
    public static function uploadPhoto(array $params): void
    {
        Auth::requireAdmin();
        Csrf::verifyOrFail();
        $wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
        $event = EventsAdmin::find($params['id']);
        if ($event === null) {
            self::photoResult($params['id'], $wantsJson, 'El evento ya no existe.');
            return;
        }
        $file = isset($_FILES['photo']) && is_array($_FILES['photo']) ? $_FILES['photo'] : null;
        $error = EventImages::validate($file);
        if ($error !== null) {
            self::photoResult($event['id'], $wantsJson, $error);
            return;
        }
        $url = EventImages::store($event['id'], $file);
        EventsAdmin::setImage($event['id'], $url);
        // Delete the previous file only after the new one is saved.
        if ($event['image_url'] !== $url) {
            EventImages::delete($event['image_url']);
        }
        Session::flash('photo_notice', 'Foto guardada.');
        self::photoResult($event['id'], $wantsJson, null);
    }

    /** @param array<string, string> $params */
    public static function removePhoto(array $params): void
    {
        Auth::requireAdmin();
        Csrf::verifyOrFail();
        $event = EventsAdmin::find($params['id']) ?? not_found();
        EventsAdmin::setImage($event['id'], null);
        EventImages::delete($event['image_url']);
        Session::flash('photo_notice', 'Foto eliminada.');
        redirect('/admin/eventos/' . $event['id']);
    }

    /**
     * @param array<string, mixed> $event
     * @param array<string, string> $values
     * @param array<string, string> $errors
     */
    private static function renderEdit(string $user, array $event, array $values, array $errors = [], ?string $formError = null, int $status = 200): void
    {
        admin_respond('admin/events/edit', self::formData('/admin/eventos/' . $event['id'], 'Guardar cambios', $values, $errors, $formError) + [
            'event' => $event,
            'photoNotice' => Session::flash('photo_notice'),
            'photoError' => Session::flash('photo_error'),
            'title' => 'Editar evento',
        ], $user, false, $status);
    }

    /**
     * @param array<string, string> $values
     * @param array<string, string> $errors
     * @return array<string, mixed>
     */
    private static function formData(string $action, string $submitLabel, array $values, array $errors = [], ?string $formError = null): array
    {
        return [
            'action' => $action,
            'submitLabel' => $submitLabel,
            'values' => $values,
            'errors' => $errors,
            'formError' => $formError,
            'title' => $submitLabel === 'Crear evento' ? 'Nuevo evento' : 'Editar evento',
        ];
    }

    /** @return array<string, string> */
    private static function posted(): array
    {
        $fields = ['title', 'theme', 'description', 'location', 'startsAt', 'endsAt', 'capacity', 'price', 'isPublished'];
        $values = [];
        foreach ($fields as $field) {
            $values[$field] = isset($_POST[$field]) && is_string($_POST[$field]) ? $_POST[$field] : '';
        }
        return $values;
    }

    /**
     * @param array<string, mixed> $event
     * @return array<string, string>
     */
    private static function valuesFromEvent(array $event): array
    {
        return [
            'title' => (string) $event['title'],
            'theme' => (string) ($event['theme'] ?? ''),
            'description' => (string) ($event['description'] ?? ''),
            'location' => (string) ($event['location'] ?? ''),
            'startsAt' => Validation::utcToBuenosAiresInput((string) $event['starts_at']),
            'endsAt' => Validation::utcToBuenosAiresInput((string) $event['ends_at']),
            'capacity' => (string) $event['capacity'],
            'price' => (string) $event['price'],
            'isPublished' => $event['is_published'] ? 'on' : '',
        ];
    }

    private static function photoResult(string $eventId, bool $wantsJson, ?string $error): void
    {
        if ($wantsJson) {
            http_response_code($error === null ? 200 : 422);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($error === null ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
            return;
        }
        if ($error !== null) {
            Session::flash('photo_error', $error);
        }
        redirect('/admin/eventos/' . $eventId);
    }
}
