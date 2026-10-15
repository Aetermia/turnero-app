import { z } from "zod";

/**
 * Server-only validation for the reservation form.
 *
 * Kept out of the client bundle on purpose: importing it from a client component
 * would ship Zod to the phone, and this is a mobile-first app. The client relies
 * on plain HTML validation plus the field errors the action returns.
 */

/** Yes/no answer for the health-condition question. */
const yesNoAnswer = z.enum(["yes", "no"], "Elegí una opción");

export const reservationSchema = z
  .object({
    eventId: z.uuid("No pudimos identificar el evento"),
    fullName: z
      .string("Ingresá tu nombre y apellido")
      .trim()
      .min(1, "Ingresá tu nombre y apellido"),
    email: z
      .string("Ingresá tu email")
      .trim()
      .toLowerCase()
      .pipe(z.email("Ingresá un email válido")),
    whatsapp: z
      .string("Ingresá tu WhatsApp")
      .trim()
      .min(1, "Ingresá tu WhatsApp"),
    hasHealthCondition: yesNoAnswer,
    // Free text. Required only when the answer is "yes"; ignored otherwise.
    healthCondition: z.string().trim().nullish(),
    // Marketing consent is optional and must stay independent of the terms:
    // bundling both into one checkbox is not valid consent under Ley 25.326.
    marketingConsent: z.preprocess(
      (value) => value === "on" || value === true,
      z.boolean(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.hasHealthCondition === "yes" && !data.healthCondition) {
      ctx.addIssue({
        code: "custom",
        path: ["healthCondition"],
        message: "Contanos brevemente cuál es la condición",
      });
    }
  })
  .transform((data) => ({
    eventId: data.eventId,
    fullName: data.fullName,
    email: data.email,
    whatsapp: data.whatsapp,
    hasHealthCondition: data.hasHealthCondition === "yes",
    healthCondition:
      data.hasHealthCondition === "yes" ? (data.healthCondition ?? "") : null,
    marketingConsent: data.marketingConsent,
  }));

/** Validated values, with the yes/no answer already turned into a boolean. */
export type ReservationFormValues = z.infer<typeof reservationSchema>;
