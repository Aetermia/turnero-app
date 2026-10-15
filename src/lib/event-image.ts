/*
 * Upload rules for event photos.
 *
 * Single source of truth, like the receipt rules: the browser applies these
 * before compressing and uploading, and the Server Action applies them again
 * when it mints the signed upload URL. One list means the file picker can never
 * accept something the server would reject.
 */

export const ALLOWED_EVENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  // Non-standard, but some mobile clients report it instead of `image/jpeg`.
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export const MAX_EVENT_IMAGE_FILE_SIZE = 8 * 1024 * 1024; // 8MB

export const EVENT_IMAGE_FORMATS_LABEL = "JPG, PNG, WEBP o HEIC";

/** Longest edge the browser keeps before uploading. */
export const EVENT_IMAGE_MAX_DIMENSION = 1600;

/** Quality the browser uses when it re-encodes the photo. */
export const EVENT_IMAGE_JPEG_QUALITY = 0.85;

export function isAllowedEventImageMimeType(
  value: string,
): value is (typeof ALLOWED_EVENT_IMAGE_MIME_TYPES)[number] {
  return (ALLOWED_EVENT_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Extension used in the object path.
 *
 * Derived from the MIME type and never from the submitted file name, so the
 * caller cannot talk the path into an extension we did not allow, and a file
 * named `foto` or `foto.PNG` still lands correctly.
 */
export function eventImageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    default:
      return "jpg";
  }
}
