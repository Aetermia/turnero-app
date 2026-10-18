<?php

declare(strict_types=1);

/*
 * Event photos. Unlike receipts they are PUBLIC content (they are shown in the
 * catalog), so they live inside the web root, in public/uploads/events/<id>/.
 * The folder's .htaccess refuses to run code. The type is decided by the
 * file's content and the name is generated here, like receipts.
 */
final class EventImages
{
    public const MAX_BYTES = 8 * 1024 * 1024;
    public const FORMATS_LABEL = 'JPG, PNG, WEBP o HEIC';
    private const PUBLIC_PREFIX = '/uploads/events/';

    private const ALLOWED = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/heic' => 'heic',
        'image/heif' => 'heic',
    ];

    public static function directory(): string
    {
        return ROOT_DIR . '/public/uploads/events';
    }

    /** @param array<string, mixed>|null $file */
    public static function validate(?array $file): ?string
    {
        if ($file === null || !isset($file['error']) || (int) $file['error'] === UPLOAD_ERR_NO_FILE) {
            return 'Elegí una foto.';
        }
        $error = (int) $file['error'];
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            return 'La foto supera los 8MB.';
        }
        if ($error !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
            return 'No pudimos subir la foto. Revisá tu conexión y probá de nuevo.';
        }
        if ((int) $file['size'] <= 0) {
            return 'El archivo está vacío.';
        }
        if ((int) $file['size'] > self::MAX_BYTES) {
            return 'La foto supera los 8MB.';
        }
        $type = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
        if (!is_string($type) || !isset(self::ALLOWED[$type])) {
            return 'Formato no soportado. Permitidos: ' . self::FORMATS_LABEL . '.';
        }
        return null;
    }

    /**
     * Moves a validated upload and returns its public URL.
     *
     * @param array<string, mixed> $file
     */
    public static function store(string $eventId, array $file): string
    {
        $type = (string) (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
        $extension = self::ALLOWED[$type] ?? throw new RuntimeException('store() called with an unvalidated file');
        $folder = self::directory() . '/' . $eventId;
        if (!is_dir($folder) && !mkdir($folder, 0755, true) && !is_dir($folder)) {
            throw new RuntimeException('Could not create the event photo folder');
        }
        $name = gmdate('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $extension;
        if (!move_uploaded_file((string) $file['tmp_name'], $folder . '/' . $name)) {
            throw new RuntimeException('Could not store the event photo');
        }
        chmod($folder . '/' . $name, 0644);
        return self::PUBLIC_PREFIX . $eventId . '/' . $name;
    }

    /**
     * Deletes a photo this module stored. Anything else (like the sample
     * photos in /img/) is left alone.
     */
    public static function delete(?string $publicUrl): void
    {
        if ($publicUrl === null || !preg_match('#^/uploads/events/([0-9a-f-]{36})/([0-9]{14}-[0-9a-f]{12}\.(jpg|png|webp|heic))$#', $publicUrl, $m)) {
            return;
        }
        $path = self::directory() . '/' . $m[1] . '/' . $m[2];
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
