<?php

declare(strict_types=1);

/*
 * One-tap WhatsApp for a reservation, admin side (port of src/lib/whatsapp.ts).
 *
 * Nothing here sends anything: the panel opens WhatsApp with a pre-built
 * message and the owner reviews, edits and sends it by hand. The number is
 * free text, so the link runs on a tolerant but bounded normalization, best
 * effort by design, exactly like the original.
 */
final class WhatsApp
{
    /**
     * Digits only; drops an international 00, a national trunk 0 and the
     * legacy mobile 15, then prepends Argentina's 54 unless already there.
     */
    public static function normalize(string $raw): string
    {
        $digits = (string) preg_replace('/\D/', '', $raw);
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }
        if (str_starts_with($digits, '15')) {
            $digits = substr($digits, 2);
        }
        if (!str_starts_with($digits, '54')) {
            $digits = '54' . $digits;
        }
        return $digits;
    }

    /** wa.me link, or null when the number is not a plausible Argentine one (12 or 13 digits). */
    public static function deepLink(string $phone, string $message): ?string
    {
        $digits = self::normalize($phone);
        $length = strlen($digits);
        if (($length !== 12 && $length !== 13) || !str_starts_with($digits, '54')) {
            return null;
        }
        return 'https://wa.me/' . $digits . '?text=' . self::encodeUriComponent($message);
    }

    /**
     * Pre-built message for the reservation's EFFECTIVE state, in Spanish,
     * tuteo, no emojis. Same wording as the original.
     *
     * @param array{full_name: string, event_title: string, event_starts_at: string, event_price: string,
     *              expires_at: ?string, rejection_reason: ?string, payment_alias: ?string, effective_status: string} $in
     */
    public static function reservationMessage(array $in): string
    {
        $trimmed = (string) preg_replace('/^\s+|\s+$/u', '', $in['full_name']);
        $name = preg_split('/\s+/u', $trimmed)[0] ?? $trimmed;
        $event = $in['event_title'];
        $eventAt = Format::eventDate($in['event_starts_at']) . ' a las ' . Format::eventTime($in['event_starts_at']);

        switch ($in['effective_status']) {
            case 'pending_no_receipt':
                $alias = $in['payment_alias'] ?? 'que te pasamos por este chat';
                $deadline = $in['expires_at'] !== null ? ' antes del ' . Format::dateTime($in['expires_at']) : '';
                return "¡Hola {$name}! Te guardamos el lugar para {$event} el {$eventAt}. Para confirmarlo, transferí {$in['event_price']} al alias {$alias}{$deadline}. Pasado ese plazo el lugar se libera solo. ¡Cualquier cosa, escribinos!";
            case 'pending_review':
                return "¡Hola {$name}! Ya recibimos tu comprobante para {$event}. Lo estamos revisando y en breve te confirmamos. ¡Gracias!";
            case 'approved':
                return "¡Hola {$name}! Tu reserva para {$event} el {$eventAt} está CONFIRMADA. Te esperamos. ¡Gracias!";
            case 'rejected':
                $reason = $in['rejection_reason'] ? ' ' . $in['rejection_reason'] : '';
                return "¡Hola {$name}! No pudimos confirmar tu reserva para {$event}.{$reason} Si querés, escribinos y vemos cómo ayudarte.";
            case 'expired':
                return "¡Hola {$name}! Se venció el plazo para tu reserva de {$event} y el lugar se liberó. Si todavía querés venir, avisanos y vemos si quedan lugares.";
            default:
                return "¡Hola {$name}! Te escribimos por tu reserva para {$event}. Si necesitás algo, respondé este mensaje y te ayudamos. ¡Gracias!";
        }
    }

    /** Same output as JavaScript's encodeURIComponent (which keeps ! ' ( ) * as-is). */
    public static function encodeUriComponent(string $text): string
    {
        return strtr(rawurlencode($text), ['%21' => '!', '%27' => "'", '%28' => '(', '%29' => ')', '%2A' => '*']);
    }
}
