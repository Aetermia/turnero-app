<?php

declare(strict_types=1);

/*
 * User-facing formatting, ported from src/lib/format.ts with the same output.
 *
 * Every DATETIME in the database is UTC; everything shown to a person is in
 * Buenos Aires time. Spanish names are spelled out here instead of relying on
 * the intl extension, which many shared hosts do not install. Argentina has
 * had no daylight saving since 2009, but the conversion still goes through
 * the tz database, so it stays correct if that ever changes.
 */
final class Format
{
    public const TIMEZONE = 'America/Argentina/Buenos_Aires';

    private const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    private const MONTHS = [
        1 => 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];

    private const STATUS_LABELS = [
        'pending_no_receipt' => 'Pendiente de comprobante',
        'pending_review' => 'En revisión',
        'approved' => 'Aprobada',
        'rejected' => 'Rechazada',
        'expired' => 'Expirada',
        'cancelled' => 'Cancelada',
    ];

    /** A UTC DATETIME string from the database, as a Buenos Aires date. */
    public static function local(string $utcDateTime): DateTimeImmutable
    {
        $utc = new DateTimeImmutable($utcDateTime, new DateTimeZone('UTC'));
        return $utc->setTimezone(new DateTimeZone(self::TIMEZONE));
    }

    /**
     * e.g. "viernes 17 de octubre". Lowercase so it reads naturally
     * mid-sentence; wrap it in capitalizeFirst() where it opens a line.
     */
    public static function eventDate(string $utcDateTime): string
    {
        $d = self::local($utcDateTime);
        return self::WEEKDAYS[(int) $d->format('w')] . ' ' . $d->format('j') . ' de ' . self::MONTHS[(int) $d->format('n')];
    }

    /** "18" for a whole hour, "18:30" otherwise. */
    private static function clock(string $utcDateTime): string
    {
        $d = self::local($utcDateTime);
        $minute = $d->format('i');
        return $minute === '00' ? $d->format('G') : $d->format('G') . ':' . $minute;
    }

    /** e.g. "18 hs" or "18:30 hs". */
    public static function eventTime(string $utcDateTime): string
    {
        return self::clock($utcDateTime) . ' hs';
    }

    /** e.g. "18 a 20 hs". */
    public static function eventTimeRange(string $startUtc, string $endUtc): string
    {
        return self::clock($startUtc) . ' a ' . self::clock($endUtc) . ' hs';
    }

    public static function capitalizeFirst(string $text): string
    {
        return mb_strtoupper(mb_substr($text, 0, 1)) . mb_substr($text, 1);
    }

    /** e.g. "17 de octubre de 2026, 18:00". */
    public static function dateTime(string $utcDateTime): string
    {
        $d = self::local($utcDateTime);
        return $d->format('j') . ' de ' . self::MONTHS[(int) $d->format('n')] . ' de ' . $d->format('Y') . ', ' . $d->format('H:i');
    }

    /**
     * e.g. "5 de octubre de 2026" for a DATE column (transfer_date). A date has
     * no time, so it is shown as the same calendar day the person typed.
     */
    public static function isoDate(string $date): string
    {
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if ($d === false) {
            return $date;
        }
        return $d->format('j') . ' de ' . self::MONTHS[(int) $d->format('n')] . ' de ' . $d->format('Y');
    }

    /** Spanish label for a reservation status; an unknown value shows as-is. */
    public static function reservationStatus(string $status): string
    {
        return self::STATUS_LABELS[$status] ?? $status;
    }

    /**
     * e.g. "$ 15.000,00" (with a non-breaking space, like Intl in es-AR).
     * The price is a DECIMAL string; it is split as text, never via float.
     */
    public static function price(string $price): string
    {
        $negative = str_starts_with($price, '-');
        $price = ltrim($price, '-');
        [$whole, $cents] = array_pad(explode('.', $price, 2), 2, '0');
        $cents = str_pad(substr($cents, 0, 2), 2, '0');
        $whole = ltrim($whole, '0');
        $whole = $whole === '' ? '0' : $whole;
        $grouped = strrev(implode('.', str_split(strrev($whole), 3)));
        return ($negative ? '-' : '') . "\$\u{00A0}" . $grouped . ',' . $cents;
    }
}
