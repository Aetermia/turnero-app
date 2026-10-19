<?php

declare(strict_types=1);

/*
 * Public status page reached only with the secret token, and the two payment
 * steps: uploading the receipt and declaring the transfer.
 */
final class ReservationController
{
    /** @param array<string, string> $params */
    public static function show(array $params): void
    {
        $reservation = Reservations::byToken($params['token']);
        if ($reservation === null) {
            not_found();
        }
        self::render($reservation, 200, [
            'uploadError' => Session::flash('upload_error'),
        ]);
    }

    /**
     * Step 1 of the payment: the receipt file. Answers JSON to upload.js and
     * a redirect to the plain HTML form (no JavaScript).
     *
     * @param array<string, string> $params
     */
    public static function upload(array $params): void
    {
        $token = $params['token'];
        $wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');

        // A body over post_max_size arrives with $_POST and $_FILES empty, so
        // it would look like a missing CSRF token. Say what really happened.
        if (self::bodyExceedsPostMax()) {
            self::uploadResult($token, $wantsJson, 'El archivo supera los 8MB', 413);
            return;
        }
        Csrf::verifyOrFail();

        if (Reservations::byToken($token) === null) {
            not_found();
        }
        $file = isset($_FILES['receipt']) && is_array($_FILES['receipt']) ? $_FILES['receipt'] : null;
        $error = Receipts::validate($file);
        if ($error !== null) {
            self::uploadResult($token, $wantsJson, $error, 422);
            return;
        }
        $result = Reservations::attachReceipt($token, $file);
        self::uploadResult($token, $wantsJson, $result['ok'] ? null : $result['error'], $result['ok'] ? 200 : 422);
    }

    /**
     * Step 2 of the payment: the declared transfer data.
     *
     * @param array<string, string> $params
     */
    public static function confirm(array $params): void
    {
        Csrf::verifyOrFail();
        $token = $params['token'];
        $reservation = Reservations::byToken($token);
        if ($reservation === null) {
            not_found();
        }

        $validation = Validation::transfer($_POST);
        $old = array_map(
            static fn ($v): string => is_string($v) ? $v : '',
            array_intersect_key($_POST, array_flip(['transferHolder', 'transferAmount', 'transferDate', 'transferReference'])),
        );
        if ($validation['errors'] !== []) {
            self::render($reservation, 422, ['errors' => $validation['errors'], 'old' => $old]);
            return;
        }

        $result = Reservations::confirmPayment($token, $validation['values']);
        if (!$result['ok']) {
            // Re-read: the state may have changed (e.g. the hold expired).
            self::render(Reservations::byToken($token) ?? $reservation, 422, ['formError' => $result['error'], 'old' => $old]);
            return;
        }
        redirect('/reservas/' . $token);
    }

    /**
     * @param array<string, mixed> $reservation
     * @param array<string, mixed> $extra
     */
    private static function render(array $reservation, int $status, array $extra = []): void
    {
        respond('reservation', $extra + [
            'reservation' => $reservation,
            'paymentAlias' => Config::paymentAlias(),
            'errors' => [],
            'old' => [],
            'formError' => null,
            'uploadError' => null,
            'title' => 'Tu reserva',
            'noindex' => true,
        ], $status);
    }

    private static function uploadResult(string $token, bool $wantsJson, ?string $error, int $status): void
    {
        if ($wantsJson) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($error === null ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
            return;
        }
        if ($error !== null) {
            Session::flash('upload_error', $error);
        }
        redirect('/reservas/' . $token);
    }

    private static function bodyExceedsPostMax(): bool
    {
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $limit = self::iniBytes((string) ini_get('post_max_size'));
        return $limit > 0 && $length > $limit;
    }

    private static function iniBytes(string $value): int
    {
        $value = trim($value);
        $number = (int) $value;
        return match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
