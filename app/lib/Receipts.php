<?php

declare(strict_types=1);

/*
 * Payment receipts on disk (R2). They live in storage/receipts, OUTSIDE
 * public_html: no URL reaches them. The only way out is the admin script that
 * checks the session (P9).
 *
 * The type is decided by the file's real content (finfo), never by the name or
 * by what the browser claims, and the stored name is generated here, so an
 * upload can never choose its own path or extension.
 */
final class Receipts
{
    public const MAX_BYTES = 8 * 1024 * 1024; // 8 MB, same as the Next.js version
    public const FORMATS_LABEL = 'JPG, PNG, WEBP, HEIC o PDF';

    /** Detected MIME type => stored extension. */
    public const ALLOWED = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/heic' => 'heic',
        'image/heif' => 'heic',
        'application/pdf' => 'pdf',
    ];

    public static function directory(): string
    {
        return STORAGE_DIR . '/receipts';
    }

    /**
     * Validates an uploaded file ($_FILES entry). Returns an error message in
     * Spanish, or null when the file is acceptable.
     *
     * @param array<string, mixed>|null $file
     */
    public static function validate(?array $file): ?string
    {
        if ($file === null || !isset($file['error'])) {
            return 'Elegí el comprobante para subir';
        }
        $error = (int) $file['error'];
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            return 'El archivo supera los 8MB';
        }
        if ($error === UPLOAD_ERR_NO_FILE) {
            return 'Elegí el comprobante para subir';
        }
        if ($error !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
            return 'No pudimos recibir el archivo. Probá de nuevo.';
        }
        $size = (int) $file['size'];
        if ($size <= 0) {
            return 'Archivo vacío';
        }
        if ($size > self::MAX_BYTES) {
            return 'El archivo supera los 8MB';
        }
        if (self::detectType((string) $file['tmp_name']) === null) {
            return 'Formato no soportado. Permitidos: ' . self::FORMATS_LABEL;
        }
        return null;
    }

    /** The real MIME type from the file's bytes, or null if not allowed. */
    public static function detectType(string $path): ?string
    {
        $type = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        return is_string($type) && isset(self::ALLOWED[$type]) ? $type : null;
    }

    /**
     * Moves a validated upload into private storage and returns
     * [relative path, mime type].
     *
     * @param array<string, mixed> $file
     * @return array{string, string}
     */
    public static function store(string $reservationId, array $file): array
    {
        $type = self::detectType((string) $file['tmp_name']);
        if ($type === null) {
            throw new RuntimeException('store() called with an unvalidated file');
        }
        $folder = self::directory() . '/' . $reservationId;
        if (!is_dir($folder) && !mkdir($folder, 0750, true) && !is_dir($folder)) {
            throw new RuntimeException('Could not create the receipts folder');
        }
        $name = gmdate('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . self::ALLOWED[$type];
        if (!move_uploaded_file((string) $file['tmp_name'], $folder . '/' . $name)) {
            throw new RuntimeException('Could not store the receipt');
        }
        chmod($folder . '/' . $name, 0640);
        return [$reservationId . '/' . $name, $type];
    }

    /** Absolute path of a stored receipt, refusing anything outside the folder. */
    public static function absolutePath(string $relative): ?string
    {
        if (!preg_match('#^[0-9a-f-]{36}/[0-9]{14}-[0-9a-f]{12}\.(jpg|png|webp|heic|pdf)$#', $relative)) {
            return null;
        }
        $path = self::directory() . '/' . $relative;
        return is_file($path) ? $path : null;
    }

    public static function delete(?string $relative): void
    {
        if ($relative === null) {
            return;
        }
        $path = self::absolutePath($relative);
        if ($path !== null) {
            @unlink($path);
        }
    }

    public static function isPdf(?string $mimeType): bool
    {
        return $mimeType === 'application/pdf';
    }
}
