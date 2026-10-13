import { z } from "zod";
import { reservationStatus } from "@/db/schema";

/**
 * Server-only validation for the admin panel.
 *
 * Kept out of the client bundle on purpose, like the reservation, event and
 * client schemas: the grids rely on plain HTML plus the errors the actions
 * return.
 *
 * The list filters arrive from the URL, which anybody can edit. A bad value must
 * be IGNORED, not rejected: a hand-typed `?status=whatever` has to render the
 * full list, never a 500. That is why every filter falls back to `undefined`
 * with `.catch()` instead of failing the parse.
 */

const reservationStatusSchema = z.enum(reservationStatus.enumValues);

export const adminReservationFiltersSchema = z.object({
  // An empty string (the "all" option) fails the uuid check and becomes
  // `undefined`, so "no filter" is represented one single way.
  eventId: z.uuid().optional().catch(undefined),
  status: reservationStatusSchema.optional().catch(undefined),
});

/** Validated filters; `undefined` means "no filter applied". */
export type AdminReservationFilters = z.infer<
  typeof adminReservationFiltersSchema
>;

/** A repeated query param (`?status=a&status=b`) becomes the first value. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Normalizes raw `searchParams` into filters, dropping anything invalid. */
export function parseAdminReservationFilters(params: {
  eventId?: string | string[];
  status?: string | string[];
}): AdminReservationFilters {
  const parsed = adminReservationFiltersSchema.safeParse({
    eventId: firstValue(params.eventId),
    status: firstValue(params.status),
  });

  return parsed.success ? parsed.data : {};
}

/**
 * Client list filters: a single free-text search over name, email and whatsapp.
 *
 * Trimmed and capped at 100 characters, matching the reservations filters'
 * policy: a value that does not fit — or is not a string — is IGNORED, never a
 * 500, so "no filter" is represented one single way. The LIKE escaping itself
 * lives in `listClientsForAdmin`; this schema only validates the term.
 */
export const adminClientFiltersSchema = z.object({
  search: z.string().trim().max(100).optional().catch(undefined),
});

/** Validated client filters; `undefined` means "no filter applied". */
export type AdminClientFilters = z.infer<typeof adminClientFiltersSchema>;

/** Normalizes raw `searchParams` into client filters, dropping anything invalid. */
export function parseAdminClientFilters(params: {
  search?: string | string[];
}): AdminClientFilters {
  const parsed = adminClientFiltersSchema.safeParse({
    search: firstValue(params.search),
  });

  return parsed.success ? parsed.data : {};
}

/**
 * Rejection form: the reason is optional free text. The cap stops an accidental
 * paste from filling the column, and an empty reason becomes `null` so the
 * detail page can tell "rejected with a note" from "rejected silently".
 */
export const rejectionSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .max(500, "El motivo no puede superar los 500 caracteres")
    .optional()
    .transform((value) => (value ? value : null)),
});

/** Fields of the rejection form the action can tie an error to. */
export type RejectionFormField = "rejectionReason";
