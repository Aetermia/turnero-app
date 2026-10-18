<?php

declare(strict_types=1);

/*
 * Panel access: login, logout and dashboard. Every other panel controller
 * calls Auth::requireAdmin() first and renders through admin_respond().
 */
final class AdminController
{
    private const ERROR_MESSAGES = [
        'credentials' => 'Usuario o contraseña incorrectos.',
        'config' => 'El acceso de administrador todavía no está configurado en el servidor. Revisá config/config.php.',
    ];
    private const DEFAULT_ERROR = 'No pudimos iniciar sesión. Intentá de nuevo.';

    public static function loginForm(): void
    {
        if (Auth::user() !== null) {
            redirect('/admin', 302);
        }
        $error = query_string('error');
        respond('admin/login', [
            'errorMessage' => $error === null || $error === '' ? null : (self::ERROR_MESSAGES[$error] ?? self::DEFAULT_ERROR),
            'title' => 'Panel de administración',
            'noindex' => true,
        ]);
    }

    public static function login(): void
    {
        Csrf::verifyOrFail();
        if (!Auth::isConfigured()) {
            error_log('Admin login rejected: admin.user or admin.password_hash is missing or invalid in config.php.');
            redirect('/admin/login?error=config');
        }
        $username = (string) post_string('username');
        $password = isset($_POST['password']) && is_string($_POST['password']) ? $_POST['password'] : '';
        if (!Auth::attempt($username, $password)) {
            redirect('/admin/login?error=credentials');
        }
        Auth::login($username);
        redirect('/admin');
    }

    public static function logout(): void
    {
        Csrf::verifyOrFail();
        Auth::logout();
        redirect('/admin/login');
    }

    public static function dashboard(): void
    {
        $user = Auth::requireAdmin();
        admin_respond('admin/dashboard', ['title' => 'Panel de administración'], $user, true);
    }
}
