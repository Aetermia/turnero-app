/*
 * Upload rules for payment receipts.
 *
 * This is the single source of truth. The browser applies these rules before
 * compressing and uploading, and the Server Actions apply them again when they
 * mint the signed upload URL and when they store the declared receipt. One list
 * means the file picker can never accept something the server would reject.
 */

export const ALLOWED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  // Non-standard, but some mobile clients report it instead of `image/jpeg`.
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export const MAX_RECEIPT_FILE_SIZE = 8 * 1024 * 1024; // 8MB

export function isAllowedReceiptMimeType(
  value: string,
): value is (typeof ALLOWED_RECEIPT_MIME_TYPES)[number] {
  return (ALLOWED_RECEIPT_MIME_TYPES as readonly string[]).includes(value);
}
