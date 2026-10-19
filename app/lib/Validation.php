<?php

declare(strict_types=1);

/*
 * Server-side validation of the forms (port of the Zod schemas). Input that
 * did not pass validation never reaches the database. HTML attributes in the
 * forms are a convenience for the person; these checks are the real gate.
 */
final class Validation
{
    /**
     * Booking form, step 1 (port of src/lib/reservation-schema.ts).
     *
     * @param array<string, mixed> $post
     * @return array{values: array<string, mixed>, errors: array<string, string>}
     */
    public static function reservation(array $post): array
    {
        $errors = [];
        $str = static fn (string $key): ?string => isset($post[$key]) && is_string($post[$key]) ? trim($post[$key]) : null;

        $fullName = $str('fullName');
        if ($fullName === null || $fullName === '') {
            $errors['fullName'] = 'Ingresá tu nombre y apellido';
        } elseif (mb_strlen($fullName) > 200) {
            $errors['fullName'] = 'El nombre es demasiado largo';
        }

        $email = $str('email');
        if ($email === null) {
            $errors['email'] = 'Ingresá tu email';
        } else {
            $email = mb_strtolower($email);
            if (mb_strlen($email) > 320 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                $errors['email'] = 'Ingresá un email válido';
            }
        }

        $whatsapp = $str('whatsapp');
        if ($whatsapp === null || $whatsapp === '') {
            $errors['whatsapp'] = 'Ingresá tu WhatsApp';
        } elseif (mb_strlen($whatsapp) > 32) {
            $errors['whatsapp'] = 'El número es demasiado largo';
        }

        $answer = $str('hasHealthCondition');
        if (!in_array($answer, ['yes', 'no'], true)) {
            $errors['hasHealthCondition'] = 'Elegí una opción';
        }

        // Free text, required only when the answer is "yes"; ignored otherwise.
        $condition = $str('healthCondition');
        if ($answer === 'yes' && ($condition === null || $condition === '')) {
            $errors['healthCondition'] = 'Contanos brevemente cuál es la condición';
        }

        // An unchecked checkbox is not submitted at all. Marketing consent is
        // optional and stays independent of everything else (Ley 25.326).
        $marketing = ($post['marketingConsent'] ?? null) === 'on';

        return [
            'values' => [
                'full_name' => (string) $fullName,
                'email' => (string) $email,
                'whatsapp' => (string) $whatsapp,
                'has_condition' => $answer === 'yes',
                'condition_details' => $answer === 'yes' ? (string) $condition : null,
                'marketing_consent' => $marketing,
            ],
            'errors' => $errors,
        ];
    }

    /**
     * Payment step: declared transfer data (port of completeReservationSchema).
     *
     * @param array<string, mixed> $post
     * @return array{values: array<string, string>, errors: array<string, string>}
     */
    public static function transfer(array $post): array
    {
        $errors = [];
        $str = static fn (string $key): string => isset($post[$key]) && is_string($post[$key]) ? trim($post[$key]) : '';

        $holder = $str('transferHolder');
        if ($holder === '') {
            $errors['transferHolder'] = 'Ingresá el titular de la transferencia';
        } elseif (mb_strlen($holder) > 200) {
            $errors['transferHolder'] = 'El titular es demasiado largo';
        }

        $amount = $str('transferAmount');
        if ($amount === '') {
            $errors['transferAmount'] = 'Ingresá el monto transferido';
        } elseif (!preg_match('/^\d+(\.\d{1,2})?$/', $amount) && !preg_match('/^\d+(,\d{1,2})?$/', $amount)) {
            $errors['transferAmount'] = 'Formato de monto inválido (ej. 15000 o 15000.50)';
        } elseif (strlen(explode(',', str_replace('.', ',', $amount))[0]) > 8) {
            $errors['transferAmount'] = 'Formato de monto inválido (ej. 15000 o 15000.50)';
        }
        $amount = str_replace(',', '.', $amount);

        // A real calendar date: the original accepted any text here, which
        // the database would have rejected with an error.
        $date = $str('transferDate');
        if ($date === '') {
            $errors['transferDate'] = 'Ingresá la fecha de transferencia';
        } else {
            $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
            if ($parsed === false || $parsed->format('Y-m-d') !== $date) {
                $errors['transferDate'] = 'Ingresá una fecha válida';
            }
        }

        $reference = $str('transferReference');
        if ($reference === '') {
            $errors['transferReference'] = 'Ingresá el número de operación';
        } elseif (mb_strlen($reference) > 100) {
            $errors['transferReference'] = 'El número de operación es demasiado largo';
        }

        return [
            'values' => [
                'transfer_holder' => $holder,
                'transfer_amount' => $amount,
                'transfer_date' => $date,
                'transfer_reference' => $reference,
            ],
            'errors' => $errors,
        ];
    }

    /**
     * Event form, create and edit (port of src/lib/event-schema.ts). Dates
     * come from <input type="datetime-local"> in Buenos Aires wall-clock time
     * and leave here as UTC DATETIME strings.
     *
     * @param array<string, mixed> $post
     * @return array{values: array<string, mixed>, errors: array<string, string>}
     */
    public static function event(array $post): array
    {
        $errors = [];
        $str = static fn (string $key): string => isset($post[$key]) && is_string($post[$key]) ? trim($post[$key]) : '';
        $optional = static fn (string $key) => $str($key) === '' ? null : $str($key);

        $title = $str('title');
        if ($title === '') {
            $errors['title'] = 'Ingresá un título';
        } elseif (mb_strlen($title) > 200) {
            $errors['title'] = 'El título es demasiado largo';
        }
        $theme = $optional('theme');
        if ($theme !== null && mb_strlen($theme) > 100) {
            $errors['theme'] = 'La temática es demasiado larga';
        }
        $location = $optional('location');
        if ($location !== null && mb_strlen($location) > 200) {
            $errors['location'] = 'El lugar es demasiado largo';
        }

        // Well-formed but not a real date (month 13, February 30): "La fecha no
        // es válida", like the original. Unlike JavaScript, which rolls
        // February 30 over to March 2, it is rejected here.
        $dateError = static fn (string $value, string $missing): string =>
            preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/', $value) ? 'La fecha no es válida' : $missing;
        $startsAt = self::buenosAiresToUtc($str('startsAt'));
        if ($startsAt === false) {
            $errors['startsAt'] = $dateError($str('startsAt'), 'Completá la fecha y hora de inicio');
        }
        $endsAt = self::buenosAiresToUtc($str('endsAt'));
        if ($endsAt === false) {
            $errors['endsAt'] = $dateError($str('endsAt'), 'Completá la fecha y hora de fin');
        }
        if ($startsAt !== false && $endsAt !== false && $endsAt <= $startsAt) {
            $errors['endsAt'] = 'El fin tiene que ser posterior al inicio';
        }

        $capacity = $str('capacity');
        if (!isset($post['capacity']) || !is_string($post['capacity'])) {
            $errors['capacity'] = 'Ingresá la capacidad';
        } elseif (!preg_match('/^\d+$/', $capacity)) {
            $errors['capacity'] = 'Ingresá un número entero';
        } elseif ((int) $capacity <= 0) {
            $errors['capacity'] = 'La capacidad tiene que ser mayor a cero';
        } elseif (strlen(ltrim($capacity, '0')) > 6 || (int) $capacity > 100000) {
            $errors['capacity'] = 'La capacidad es demasiado grande';
        }

        // The price stays a string: DECIMAL must never go through a float. The
        // comma is what an Argentine keyboard types first. Zero is rejected
        // without parsing the money.
        $price = $str('price');
        if (!isset($post['price']) || !is_string($post['price'])) {
            $errors['price'] = 'Ingresá el precio';
        } elseif (!preg_match('/^(?!0+([.,]0{1,2})?$)\d{1,8}([.,]\d{1,2})?$/', $price)) {
            // An empty field gets the same message as in the original (Zod's
            // regex runs on the empty string too).
            $errors['price'] = 'Ingresá un precio válido (por ejemplo 15000 o 15000,50)';
        }

        return [
            'values' => [
                'title' => $title,
                'theme' => $theme,
                'description' => $optional('description'),
                'location' => $location,
                'starts_at' => $startsAt === false ? null : $startsAt,
                'ends_at' => $endsAt === false ? null : $endsAt,
                'capacity' => (int) $capacity,
                'price' => str_replace(',', '.', $price),
                'is_published' => ($post['isPublished'] ?? null) === 'on',
            ],
            'errors' => $errors,
        ];
    }

    /**
     * "2026-10-17T18:00" (Buenos Aires wall clock, what datetime-local sends)
     * => "2026-10-17 21:00:00" (UTC), or false when it is not a real date.
     */
    public static function buenosAiresToUtc(string $value): string|false
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/', $value)) {
            return false;
        }
        $format = strlen($value) === 16 ? '!Y-m-d\TH:i' : '!Y-m-d\TH:i:s';
        $local = DateTimeImmutable::createFromFormat($format, $value, new DateTimeZone(Format::TIMEZONE));
        if ($local === false || $local->format(substr($format, 1)) !== $value) {
            return false;
        }
        return $local->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** UTC DATETIME => "2026-10-17T18:00" for a datetime-local input. */
    public static function utcToBuenosAiresInput(string $utc): string
    {
        return Format::local($utc)->format('Y-m-d\TH:i');
    }

    /**
     * Reservation list filters from the URL (anybody can edit it): a bad value
     * is IGNORED, never an error, so "no filter" is always null.
     *
     * @param array<string, mixed> $query
     * @return array{eventId: string|null, status: string|null}
     */
    public static function reservationFilters(array $query): array
    {
        $eventId = $query['eventId'] ?? null;
        $status = $query['status'] ?? null;
        return [
            'eventId' => is_string($eventId) && is_uuid(strtolower($eventId)) ? strtolower($eventId) : null,
            'status' => is_string($status) && in_array($status, ReservationsAdmin::STATUSES, true) ? $status : null,
        ];
    }

    /**
     * Optional rejection reason: trimmed, at most 500 characters, empty => null.
     *
     * @param array<string, mixed> $post
     * @return array{errors: array<string, string>, value: string|null}
     */
    public static function rejectionReason(array $post): array
    {
        $raw = $post['rejectionReason'] ?? '';
        $reason = is_string($raw) ? (string) preg_replace('/^\s+|\s+$/u', '', $raw) : '';
        if (mb_strlen($reason) > 500) {
            return ['errors' => ['rejectionReason' => 'El motivo no puede superar los 500 caracteres'], 'value' => null];
        }
        return ['errors' => [], 'value' => $reason === '' ? null : $reason];
    }

    /**
     * Client search from the URL: trimmed, at most 100 characters. Anything
     * else (too long, an array) is ignored, never an error; "" means no filter.
     *
     * @param array<string, mixed> $query
     */
    public static function clientSearch(array $query): ?string
    {
        $raw = $query['search'] ?? null;
        if (!is_string($raw)) {
            return null;
        }
        $search = (string) preg_replace('/^\s+|\s+$/u', '', $raw);
        return $search === '' || mb_strlen($search) > 100 ? null : $search;
    }
}
