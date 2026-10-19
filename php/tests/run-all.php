<?php
/*
 * Runs every tests/verify-*.php and prints one line per script.
 *
 * Run: php tests/run-all.php      (exit code 0 only when all pass)
 */

declare(strict_types=1);

$failed = 0;
foreach (glob(__DIR__ . '/verify-*.php') ?: [] as $script) {
    $output = [];
    exec('php ' . escapeshellarg($script) . ' 2>&1', $output, $exit);
    $last = (string) end($output);
    printf("%-34s %s\n", basename($script), $last);
    if ($exit !== 0 || !str_starts_with($last, 'RESULT: PASS')) {
        $failed++;
    }
}
echo $failed === 0 ? "\nTODO OK\n" : "\n{$failed} script(s) con fallas\n";
exit($failed === 0 ? 0 : 1);
