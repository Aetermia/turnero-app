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
}
