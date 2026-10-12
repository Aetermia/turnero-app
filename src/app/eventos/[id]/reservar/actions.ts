"use server";

import { redirect } from "next/navigation";
import { reservationSchema } from "@/lib/reservation-schema";
import { createReservation } from "@/lib/reservations";

/**
 * Booking action. Never touches the database with unvalidated input: the Zod
 * schema runs first and only validated values reach `createReservation`.
 */

/** Fields the form renders, so a validation error can be tied to its input. */
const FIELD_NAMES = [
  "fullName",
  "email",
  "whatsapp",
  "hasHealthCondition",
  "healthCondition",
  "acceptedTerms",
  "marketingConsent",
] as const;

export type ReservationField = (typeof FIELD_NAMES)[number];

export type ReservationFormState = {
  fieldErrors: Partial<Record<ReservationField, string>>;
  formError: string | null;
};

function isFieldName(value: unknown): value is ReservationField {
  return (
    typeof value === "string" &&
    (FIELD_NAMES as readonly string[]).includes(value)
  );
}

export async function createReservationAction(
  _prevState: ReservationFormState,
  formData: FormData,
): Promise<ReservationFormState> {
  const parsed = reservationSchema.safeParse({
    eventId: formData.get("eventId"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    whatsapp: formData.get("whatsapp"),
    hasHealthCondition: formData.get("hasHealthCondition"),
    healthCondition: formData.get("healthCondition"),
    acceptedTerms: formData.get("acceptedTerms"),
    marketingConsent: formData.get("marketingConsent"),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<ReservationField, string>> = {};
    let hasUnmappedError = false;

    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (isFieldName(key)) {
        // First message per field wins; later duplicates add nothing for the UI.
        fieldErrors[key] ??= issue.message;
      } else {
        hasUnmappedError = true;
      }
    }

    return {
      fieldErrors,
      formError: hasUnmappedError ? "Revisá los datos del formulario." : null,
    };
  }

  const { eventId, ...input } = parsed.data;
  const result = await createReservation(eventId, input);

  if (!result.ok) {
    return {
      fieldErrors: {},
      formError:
        result.reason === "sold_out"
          ? "Se agotaron los lugares para este evento. Podés probar con otro encuentro."
          : result.reason === "already_reserved"
            ? "Ya tenés una reserva para este evento. Revisá el enlace que te dio el sistema al reservar."
            : "Este evento ya no está disponible para reservar.",
    };
  }

  // `redirect` throws on purpose, so it stays outside any try/catch: a catch
  // around it would swallow the navigation.
  redirect(`/reservas/${result.publicToken}`);
}
