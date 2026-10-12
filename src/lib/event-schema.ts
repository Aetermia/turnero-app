import { z } from "zod";

/**
 * Server-only validation for the event form (create and edit share it).
 *
 * Kept out of the client bundle on purpose, like the reservation schema: the
 * form relies on plain HTML validation plus the field errors the action returns,
 * so Zod never ships to the browser.
 */

/** Matches the value a native `<input type="datetime-local">` submits. */
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/**
 * Argentina has been on UTC-3 with no daylight saving since 2009, so the offset
 * is fixed. Appending it to the naive `datetime-local` value turns the
 * wall-clock time into an unambiguous instant, independent of the server's own
 * timezone.
 */
const BUENOS_AIRES_OFFSET = "-03:00";

/** Parses a `datetime-local` value as a Buenos Aires instant. */
export function parseBuenosAiresInstant(value: string): Date {
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return new Date(`${withSeconds}${BUENOS_AIRES_OFFSET}`);
}

const datetimeLocalField = (message: string) =>
  z
    .string(message)
    .trim()
    .regex(DATETIME_LOCAL_PATTERN, message)
    .refine(
      (value) => !Number.isNaN(parseBuenosAiresInstant(value).getTime()),
      "La fecha no es válida",
    );

/** Optional free text: an empty field becomes `null`, never an empty string. */
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null));

export const eventSchema = z
  .object({
    title: z.string("Ingresá un título").trim().min(1, "Ingresá un título"),
    theme: optionalText,
    description: optionalText,
    location: optionalText,
    startsAt: datetimeLocalField("Completá la fecha y hora de inicio"),
    endsAt: datetimeLocalField("Completá la fecha y hora de fin"),
    capacity: z
      .string("Ingresá la capacidad")
      .trim()
      .regex(/^\d+$/, "Ingresá un número entero")
      .transform(Number)
      .refine((value) => value > 0, "La capacidad tiene que ser mayor a cero")
      .refine((value) => value <= 100000, "La capacidad es demasiado grande"),
    /*
     * The price stays a string: `numeric` must never go through a float. The
     * comma is accepted because it is what an Argentine keyboard types first.
     * The lookahead rejects zero (and 0,00) without ever parsing the money.
     */
    price: z
      .string("Ingresá el precio")
      .trim()
      .regex(
        /^(?!0+([.,]0{1,2})?$)\d{1,8}([.,]\d{1,2})?$/,
        "Ingresá un precio válido (por ejemplo 15000 o 15000,50)",
      )
      .transform((value) => value.replace(",", ".")),
    isPublished: z.preprocess(
      (value) => value === "on" || value === true,
      z.boolean(),
    ),
  })
  .superRefine((data, ctx) => {
    const startsAt = parseBuenosAiresInstant(data.startsAt);
    const endsAt = parseBuenosAiresInstant(data.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "El fin tiene que ser posterior al inicio",
      });
    }
  })
  .transform((data) => ({
    title: data.title,
    theme: data.theme,
    description: data.description,
    location: data.location,
    startsAt: parseBuenosAiresInstant(data.startsAt),
    endsAt: parseBuenosAiresInstant(data.endsAt),
    capacity: data.capacity,
    price: data.price,
    isPublished: data.isPublished,
  }));

/** Validated values, ready for the data-access layer. */
export type EventFormValues = z.infer<typeof eventSchema>;
