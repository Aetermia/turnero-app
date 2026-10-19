<?php

declare(strict_types=1);

/*
 * Panel: clients (port of src/app/admin/(panel)/clientes). The page, the
 * copy button and the CSV export read the same filtered list, so what is
 * downloaded or copied is exactly what is on screen.
 */
final class AdminClientsController
{
    public static function index(): void
    {
        $user = Auth::requireAdmin();
        $search = Validation::clientSearch($_GET);
        admin_respond('admin/clients/index', [
            'search' => $search,
            'clients' => Clients::list($search),
            'title' => 'Clientes',
        ], $user);
    }

    public static function export(): void
    {
        // The session is checked before a single row is read.
        Auth::requireAdmin();
        $csv = Clients::toCsv(Clients::list(Validation::clientSearch($_GET)));
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="clientes-' . gmdate('Y-m-d') . '.csv"');
        header('Cache-Control: private, no-store');
        header('X-Robots-Tag: noindex');
        echo $csv;
    }
}
