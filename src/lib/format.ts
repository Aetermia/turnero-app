/**
 * User-facing formatting helpers for the public site and the admin panel.
 *
 * The times are `timestamptz` in the database, so every date/time is rendered
 * in Argentina's timezone (`America/Argentina/Buenos_Aires`); rendering them in
 * the server's default timezone would show the wrong hour to the customer.
 */

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: BUENOS_AIRES,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: BUENOS_AIRES,
  hour: "2-digit",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: BUENOS_AIRES,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const isoDateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: BUENOS_AIRES,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** e.g. "viernes 17 de octubre" — date in Buenos Aires time. */
export function formatEventDate(date: Date): string {
  return dateFormatter.format(date);
}

/** e.g. "18:00" — local time in Buenos Aires. */
export function formatEventTime(date: Date): string {
  return timeFormatter.format(date);
}

/** e.g. "17 de octubre de 2026, 18:00" — instant in Buenos Aires time. */
export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

/**
 * e.g. "5 de octubre de 2026" for a date-only `YYYY-MM-DD` value.
 *
 * `transfer_date` is a `date` column, so it has no time and Drizzle returns it
 * as a plain string. Tagging it with Buenos Aires' midnight turns it into an
 * unambiguous instant before formatting, so it renders as the same calendar day
 * the owner typed.
 */
export function formatIsoDate(value: string): string {
  return isoDateFormatter.format(new Date(`${value}T00:00:00-03:00`));
}

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending_no_receipt: "Pendiente de comprobante",
  pending_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

/**
 * Spanish label for a reservation status. An unknown value falls through as-is,
 * so a state the UI does not know about is visible instead of blank.
 */
export function formatReservationStatus(status: string): string {
  return RESERVATION_STATUS_LABELS[status] ?? status;
}

/**
 * e.g. "$ 15.000,00".
 *
 * `price` is a `numeric(10,2)` column and Drizzle deliberately returns it as a
 * string. Converting to `Number` here is safe because it is only for display:
 * money is never used in arithmetic as a float.
 */
export function formatPrice(price: string): string {
  return currencyFormatter.format(Number(price));
}
