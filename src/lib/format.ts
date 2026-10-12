/**
 * User-facing formatting helpers for the public site.
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

/** e.g. "viernes 17 de octubre" — date in Buenos Aires time. */
export function formatEventDate(date: Date): string {
  return dateFormatter.format(date);
}

/** e.g. "18:00" — local time in Buenos Aires. */
export function formatEventTime(date: Date): string {
  return timeFormatter.format(date);
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
