import { z } from "zod";
import { reservationStatus } from "@/db/schema";

/**
 * Server-only validation for the reservation management panel.
 *
 * Kept out of the client bundle on purpose, like the reservation and event
 * schemas: the grid relies on plain HTML plus the errors the action returns.
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
