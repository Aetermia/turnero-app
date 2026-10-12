import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECEIPTS_BUCKET = "receipts";

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
