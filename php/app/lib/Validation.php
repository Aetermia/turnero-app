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
}
