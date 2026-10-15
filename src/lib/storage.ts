import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECEIPTS_BUCKET = "receipts";
const EVENT_IMAGES_BUCKET = "event-images";

function assertSupabaseConfigured(): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase configuration is incomplete: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
}

/**
 * Server-side Supabase client using the service role key.
 * Only use for operations requiring elevated privileges (signed uploads for private bucket).
 */
export function getSupabaseServiceClient() {
  assertSupabaseConfigured();
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type SignedUploadUrlResult = {
  uploadUrl: string;
  path: string;
  contentType: string;
  expiresInSeconds: number;
};

/**
 * Creates a signed upload URL for the private receipts bucket.
 */
export async function createSignedUploadUrl(
  reservationId: string,
  publicToken: string,
  contentType: string,
  fileExtension: string,
  expiresInSeconds: number = 600,
): Promise<SignedUploadUrlResult> {
  const supabase = getSupabaseServiceClient();
  const timestamp = Date.now();
  const fileName = `${timestamp}.${fileExtension}`;
  const path = `reservation-${reservationId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message || "Failed to create signed upload URL",
    );
  }

  return {
    uploadUrl: data.signedUrl,
    path,
    contentType,
    expiresInSeconds: 7200, // Default validity for signed upload URLs
  };
}

export async function createSignedReceiptUrl(
  path: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Failed to create signed receipt URL");
  }

  return data.signedUrl;
}

/** Folder that holds the photos of one event inside the public bucket. */
function eventImageFolder(eventId: string): string {
  return `event-${eventId}`;
}

/**
 * Base of the public URL space of the event-images bucket.
 *
 * Supabase publishes this shape (`<url>/storage/v1/object/public/<bucket>/`),
 * and it is built from the environment instead of from a storage round trip so
 * that validation is deterministic and works for reads that never touch the
 * network.
 */
function eventImagesPublicBase(): string {
  assertSupabaseConfigured();
  return `${SUPABASE_URL!.replace(/\/+$/, "")}/storage/v1/object/public/${EVENT_IMAGES_BUCKET}/`;
}

/**
 * Public URL of an object in the event-images bucket.
 *
 * The bucket is public on purpose: a catalog photo is published content, unlike
 * a payment receipt, which stays private and is served through a signed URL
 * that expires.
 */
export function getEventImagePublicUrl(path: string): string {
  return `${eventImagesPublicBase()}${path}`;
}

/**
 * Creates a signed upload URL for the public event-images bucket.
 *
 * Signing the upload still matters even though the bucket is public: it keeps
 * the write scoped to one object path and short-lived, and the service role key
 * never leaves the server.
 */
export async function createEventImageUploadUrl(
  eventId: string,
  contentType: string,
  fileExtension: string,
): Promise<SignedUploadUrlResult> {
  const supabase = getSupabaseServiceClient();
  const path = `${eventImageFolder(eventId)}/${Date.now()}.${fileExtension}`;

  const { data, error } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Failed to create signed upload URL");
  }

  return {
    uploadUrl: data.signedUrl,
    path,
    contentType,
    expiresInSeconds: 7200,
  };
}

/**
 * The object path inside the bucket for one of our public URLs, or `null` when
 * the URL is not ours.
 *
 * Used to find the previous photo before replacing or clearing it.
 */
export function eventImagePathFromPublicUrl(url: string): string | null {
  let base: string;
  try {
    base = eventImagesPublicBase();
  } catch {
    return null;
  }

  if (!url.startsWith(base)) {
    return null;
  }

  const path = url.slice(base.length);
  /*
   * A folder is not an object: the URL must name a file inside it. Without this,
   * `.../event-<id>/` would be accepted as a photo and the catalog would render
   * a broken image instead of the placeholder.
   */
  return path.length > 0 && !path.includes("..") && !path.endsWith("/")
    ? path
    : null;
}

/**
 * True only for a public URL that points at THIS event's folder in the
 * event-images bucket.
 *
 * The browser hands this URL back after uploading, so it is untrusted input
 * even though only an admin can reach the action. A URL for another event, or
 * for another host, is rejected.
 */
export function isEventImagePublicUrlForEvent(
  url: string,
  eventId: string,
): boolean {
  const path = eventImagePathFromPublicUrl(url);
  return path !== null && path.startsWith(`${eventImageFolder(eventId)}/`);
}

/**
 * Removes one object from the event-images bucket.
 *
 * Best effort on purpose: a storage hiccup must not undo a database change that
 * already happened. The worst case is an orphaned object, which is cheaper than
 * a row pointing at a photo the owner thinks she deleted.
 */
export async function deleteEventImageObject(path: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.storage.from(EVENT_IMAGES_BUCKET).remove([path]);
  } catch (error) {
    console.error("Failed to delete event image object", error);
  }
}
