/**
 * Converts an instant into the value a native `<input type="datetime-local">`
 * expects, expressed in Buenos Aires wall-clock time. It lives next to the
 * admin event pages because it only feeds that form; the stored value stays an
 * absolute instant.
 */

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

const dateTimeLocalFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUENOS_AIRES,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type DateTimePart = "year" | "month" | "day" | "hour" | "minute";

/** e.g. "2026-10-17T18:00" — Buenos Aires time for the form's date inputs. */
export function toDateTimeLocalValue(date: Date): string {
  const parts = dateTimeLocalFormatter.formatToParts(date);
  const value = (type: DateTimePart) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
