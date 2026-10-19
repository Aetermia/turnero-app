<?php

declare(strict_types=1);

/*
 * A soft pastel tone per event theme, taken from the brand illustrations (sky
 * blue, sage, coral, sand). Same rules as src/lib/theme-tone.ts: known words
 * pick a fitting tone, anything else gets a stable tone derived from the text,
 * so the same theme always gets the same color.
 */
final class ThemeTone
{
    private const TONES = [
        'celeste' => [
            'surface' => 'bg-celeste-50 border-t-[3px] border-t-celeste-300',
            'placeholder' => 'bg-celeste-300',
        ],
        'salvia' => [
            'surface' => 'bg-salvia-50 border-t-[3px] border-t-salvia-300',
            'placeholder' => 'bg-salvia-300',
        ],
        'coral' => [
            'surface' => 'bg-coral-50 border-t-[3px] border-t-coral-300',
            'placeholder' => 'bg-coral-300',
        ],
        'arena' => [
            'surface' => 'bg-arena-50 border-t-[3px] border-t-arena-300',
            'placeholder' => 'bg-arena-300',
        ],
    ];

    private const KEYWORDS = [
        '/pint|acuarel|arte|dibuj|cer[aá]mic|ilustr/u' => 'celeste',
        '/escrit|lectur|literat|poes|libro/u' => 'salvia',
        // JavaScript's \b only counts ASCII letters as word characters, so in
        // the original "té" followed by a space is NOT a word boundary. This
        // spells out that exact JS boundary so every theme keeps its color.
        '/charla|cocin|t[eé]' . self::JS_WORD_BOUNDARY . '|merienda|brunch/u' => 'coral',
    ];

    private const JS_WORD_BOUNDARY = '(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))';

    private const FALLBACK_ORDER = ['celeste', 'salvia', 'coral', 'arena'];

    /** @return array{surface: string, placeholder: string} */
    public static function for(?string $theme): array
    {
        $normalized = mb_strtolower(trim((string) $theme));
        if ($normalized === '') {
            return self::TONES['arena'];
        }
        foreach (self::KEYWORDS as $pattern => $tone) {
            if (preg_match($pattern, $normalized)) {
                return self::TONES[$tone];
            }
        }
        // Same 32-bit hash as the JavaScript version (hash * 31 + charCode),
        // over UTF-16 code units, so a theme keeps its color after migrating.
        $hash = 0;
        foreach (self::utf16Units($normalized) as $unit) {
            $hash = ($hash * 31 + $unit) & 0xFFFFFFFF;
        }
        return self::TONES[self::FALLBACK_ORDER[$hash % count(self::FALLBACK_ORDER)]];
    }

    /** @return list<int> */
    private static function utf16Units(string $text): array
    {
        $units = unpack('n*', mb_convert_encoding($text, 'UTF-16BE', 'UTF-8'));
        return $units === false ? [] : array_values($units);
    }
}
