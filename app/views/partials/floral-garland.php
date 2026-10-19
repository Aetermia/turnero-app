<?php
/*
 * Decorative line-art flowers for the site header, drawn in the same thin navy
 * stroke as the brand illustrations. Same geometry as the Next.js version
 * (src/components/floral-garland.tsx). Purely ornamental: hidden from assistive
 * technology and never intercepts clicks.
 */

$tulip = static function (float $x, float $top): string {
    $stem = sprintf('M%s 72 C %s %s, %s %s, %s %s', $x, $x - 2, $top + 26, $x + 2, $top + 14, $x, $top);
    $bulb = sprintf(
        'M%1$s %2$s C %3$s %4$s, %5$s %6$s, %7$s %8$s C %9$s %10$s, %11$s %12$s, %1$s %13$s C %14$s %12$s, %15$s %10$s, %16$s %8$s C %17$s %6$s, %18$s %4$s, %1$s %2$s Z',
        $x, $top,
        $x - 7, $top - 3,
        $x - 9, $top - 12,
        $x - 6, $top - 20,
        $x - 4, $top - 16,
        $x - 2, $top - 14,
        $top - 13,
        $x + 2,
        $x + 4,
        $x + 6,
        $x + 9,
        $x + 7,
    );
    $petal = sprintf(
        'M%1$s %2$s C %3$s %4$s, %3$s %5$s, %1$s %6$s C %7$s %5$s, %7$s %4$s, %1$s %2$s',
        $x, $top - 13, $x - 2, $top - 17, $top - 21, $top - 24, $x + 2,
    );
    return "<g><path d=\"{$stem}\"/><path d=\"{$bulb}\"/><path d=\"{$petal}\"/></g>";
};

$blossom = static function (float $x, float $top): string {
    $stem = sprintf('M%s 72 C %s %s, %s %s, %s %s', $x, $x + 2, $top + 28, $x - 2, $top + 18, $x, $top + 8);
    $petals = '';
    foreach ([0, 72, 144, 216, 288] as $angle) {
        $petals .= sprintf(
            '<ellipse cx="%s" cy="%s" rx="3.6" ry="6.5" transform="rotate(%s %s %s)"/>',
            $x, $top - 6, $angle, $x, $top,
        );
    }
    $center = sprintf('<circle cx="%s" cy="%s" r="2.2" class="fill-accent-200"/>', $x, $top);
    return "<g><path d=\"{$stem}\"/>{$petals}{$center}</g>";
};

$leaf = static function (float $x, float $y, bool $flip = false): string {
    $d = $flip ? 1 : -1;
    $shape = sprintf(
        'M%1$s %2$s C %3$s %4$s, %5$s %6$s, %7$s %8$s C %9$s %10$s, %11$s %12$s, %1$s %2$s Z',
        $x, $y,
        $x + $d * 10, $y - 4,
        $x + $d * 16, $y - 12,
        $x + $d * 17, $y - 20,
        $x + $d * 8, $y - 16,
        $x + $d * 2, $y - 8,
    );
    $rib = sprintf(
        'M%s %s C %s %s, %s %s, %s %s',
        $x, $y, $x + $d * 6, $y - 7, $x + $d * 11, $y - 13, $x + $d * 17, $y - 20,
    );
    return "<g><path d=\"{$shape}\"/><path d=\"{$rib}\"/></g>";
};

$sprig = static function (float $x): string {
    return sprintf(
        '<g><path d="M%1$s 72 C %2$s 60, %3$s 50, %4$s 40"/>'
        . '<ellipse cx="%5$s" cy="37" rx="2.4" ry="4" transform="rotate(25 %5$s 37)"/>'
        . '<path d="M%6$s 58 C %7$s 54, %8$s 50, %9$s 46"/>'
        . '<ellipse cx="%10$s" cy="43" rx="2.2" ry="3.6" transform="rotate(-20 %10$s 43)"/>'
        . '<path d="M%11$s 50 C %12$s 48, %13$s 45, %14$s 41"/>'
        . '<ellipse cx="%15$s" cy="38" rx="2" ry="3.4" transform="rotate(30 %15$s 38)"/></g>',
        $x, $x - 1, $x + 3, $x + 8,
        $x + 9,
        $x + 2, $x - 4, $x - 7, $x - 8,
        $x - 9,
        $x + 4, $x + 9, $x + 13, $x + 15,
        $x + 16,
    );
};

// One cluster, growing up from the bottom edge, densest at its right end.
$cluster = '<g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">'
    . $sprig(36)
    . $leaf(74, 72)
    . $tulip(92, 40)
    . $leaf(92, 60)
    . $blossom(128, 30)
    . $leaf(128, 64, true)
    . $sprig(150)
    . $tulip(186, 32)
    . $leaf(186, 56, true)
    . $blossom(214, 38)
    . '</g>';

$svg = static fn (string $class): string =>
    '<svg viewBox="0 0 230 72" preserveAspectRatio="xMaxYMax slice" class="' . $class . '">' . $cluster . '</svg>';
?>
<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden text-brand-700/60">
  <?= $svg('absolute bottom-0 right-0 aspect-[230/72] h-full max-w-[34%] sm:max-w-none') ?>
  <?= $svg('absolute bottom-0 left-[300px] hidden aspect-[230/72] h-full -scale-x-100 lg:block') ?>
  <?= $svg('absolute bottom-0 left-[calc(50%+150px)] hidden aspect-[230/72] h-full -translate-x-1/2 lg:block') ?>
</div>
