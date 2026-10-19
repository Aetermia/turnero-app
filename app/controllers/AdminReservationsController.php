<?php

declare(strict_types=1);

/*
 * Panel: reservations (port of src/app/admin/(panel)/reservas). Every action
 * checks the admin session itself and every POST checks CSRF.
 *
 * The receipt is served by receipt() only: the file lives in storage/receipts,
 * outside public_html, so there is no URL that reaches it without going
 * through the admin session check here (R2).
 */
final class AdminReservationsController
{
    public static function index(): void
    {
        $user = Auth::requireAdmin();
        $filters = Validation::reservationFilters($_GET);
        admin_respond('admin/reservations/index', [
            'filters' => $filters,
            'reservations' => ReservationsAdmin::list($filters),
            'events' => EventsAdmin::all(),
            'title' => 'Reservas',
        ], $user);
    }

    /** @param array<string, string> $params */
    public static function show(array $params): void
    {
        $user = Auth::requireAdmin();
        $reservation = ReservationsAdmin::find($params['id']) ?? not_found();
        self::renderDetail($user, $reservation, query_string('error') === 'not_pending' ? self::NOT_PENDING_NOTICE : null);
    }

    /** @param array<string, string> $params */
    public static function approve(array $params): void
    {
        Auth::requireAdmin();
        Csrf::verifyOrFail();
        if (!ReservationsAdmin::approve($params['id'])) {
            redirect('/admin/reservas/' . rawurlencode($params['id']) . '?error=not_pending');
        }
        redirect('/admin/reservas/' . $params['id']);
    }

    /** @param array<string, string> $params */
    public static function reject(array $params): void
    {
        $user = Auth::requireAdmin();
        Csrf::verifyOrFail();
        $reservation = ReservationsAdmin::find($params['id']) ?? not_found();
        $validation = Validation::rejectionReason($_POST);
        if ($validation['errors'] !== []) {
            self::renderDetail($user, $reservation, null, $validation['errors'], null, 422);
            return;
        }
        if (!ReservationsAdmin::reject($reservation['id'], $validation['value'])) {
            self::renderDetail($user, ReservationsAdmin::find($reservation['id']) ?? $reservation, null, [], self::REJECT_NOT_PENDING, 409);
            return;
        }
        redirect('/admin/reservas/' . $reservation['id']);
    }

    /**
     * Streams the receipt to the admin. No session -> 307 to the login, like
     * every panel page; no receipt -> 404. Never cached, never sniffed.
     *
     * @param array<string, string> $params
     */
    public static function receipt(array $params): void
    {
        Auth::requireAdmin();
        $reservation = ReservationsAdmin::find($params['id']);
        $path = $reservation !== null && $reservation['receipt_path'] !== null
            ? Receipts::absolutePath((string) $reservation['receipt_path'])
            : null;
        if ($path === null) {
            not_found();
        }
        $mime = (string) $reservation['receipt_mime_type'];
        if (!array_key_exists($mime, Receipts::ALLOWED)) {
            $mime = 'application/octet-stream';
        }
        // Release the session lock: a big PDF must not block other panel tabs.
        session_write_close();
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: inline; filename="comprobante-' . $reservation['id'] . '.' . pathinfo($path, PATHINFO_EXTENSION) . '"');
        header('Cache-Control: private, no-store');
        header('X-Robots-Tag: noindex');
        readfile($path);
    }

    private const NOT_PENDING_NOTICE = 'No pudimos aplicar el cambio: la reserva ya no está pendiente de revisión. Recargá la página para ver su estado actual.';
    private const REJECT_NOT_PENDING = 'La reserva ya no está pendiente de revisión. Recargá la página para ver su estado actual.';

    /**
     * @param array<string, mixed> $reservation
     * @param array<string, string> $errors
     */
    private static function renderDetail(string $user, array $reservation, ?string $notice, array $errors = [], ?string $formError = null, int $status = 200): void
    {
        admin_respond('admin/reservations/show', [
            'reservation' => $reservation,
            'notice' => $notice,
            'errors' => $errors,
            'formError' => $formError,
            'reasonValue' => $errors !== [] && is_string($_POST['rejectionReason'] ?? null) ? $_POST['rejectionReason'] : '',
            'title' => 'Reserva de ' . $reservation['customer_full_name'],
        ], $user, false, $status);
    }
}
