import { formatDateTime, formatEventDate, formatEventTime } from "@/lib/format";
import type { ReservationStatus } from "@/lib/reservations";

/**
 * One-tap WhatsApp messaging for a reservation, admin side.
 *
 * Everything here is pure on purpose: the owner reviews and edits the message
 * before sending it, so no module ever sends anything by itself. The number is
 * stored as free text (see `reservation-schema.ts`), so the deep link runs on a
 * tolerant but bounded normalization documented as best effort.
 */

/**
 * Normalizes a phone number into an E.164-ish digit string by stripping any
 * non-digit character, removing an international `00` prefix, a national trunk
 * `0` and the legacy mobile `15`, then prepending Argentina's `54` unless the
 * number already starts with it.
 *
 * Best effort by design: the raw field accepts anything, and WhatsApp only
 * opens chats for plausible Argentine numbers (12 or 13 digits), which
 * `buildWhatsAppDeepLink` checks before producing a link.
 */
export function normalizeWhatsAppNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("15")) {
    digits = digits.slice(2);
  }
  if (!digits.startsWith("54")) {
    digits = `54${digits}`;
  }
  return digits;
}

/**
 * Deep link for a WhatsApp chat with the given number and pre-built message.
 *
 * Returns `null` when the normalized number is not plausible (exactly 12 or 13
 * digits under Argentina's `54`), so the caller can show a note instead of a
 * broken button. The message is encoded with `encodeURIComponent`, which
 * decodes back to the exact original text.
 */
export function buildWhatsAppDeepLink(
  phone: string,
  message: string,
): string | null {
  const digits = normalizeWhatsAppNumber(phone);
  if ((digits.length !== 12 && digits.length !== 13) || !digits.startsWith("54")) {
    return null;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Everything `buildReservationWhatsAppMessage` needs, passed explicitly. */
export type ReservationWhatsAppInput = {
  fullName: string;
  eventTitle: string;
  eventStartsAt: Date;
  /** Display-ready price (e.g. "$ 15.000,00"); used as-is. */
  eventPrice: string;
  expiresAt: Date | null;
  rejectionReason: string | null;
  paymentAlias: string | null;
  effectiveStatus: ReservationStatus;
};

function firstToken(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value.trim();
}

/**
 * One message pre-built from the reservation's EFFECTIVE state, in Spanish,
 * warm but sober (tuteo, no emojis). The owner reviews and edits it before
 * sending — nothing is sent from here.
 */
export function buildReservationWhatsAppMessage(
  input: ReservationWhatsAppInput,
): string {
  const name = firstToken(input.fullName);
  const event = input.eventTitle;
  const eventAt = `${formatEventDate(input.eventStartsAt)} a las ${formatEventTime(input.eventStartsAt)}`;

  switch (input.effectiveStatus) {
    case "pending_no_receipt": {
      const alias = input.paymentAlias ?? "que te pasamos por este chat";
      const deadline = input.expiresAt
        ? ` antes del ${formatDateTime(input.expiresAt)}`
        : "";
      return `¡Hola ${name}! Te guardamos el lugar para ${event} el ${eventAt}. Para confirmarlo, transferí ${input.eventPrice} al alias ${alias}${deadline}. Pasado ese plazo el lugar se libera solo. ¡Cualquier cosa, escribinos!`;
    }
    case "pending_review":
      return `¡Hola ${name}! Ya recibimos tu comprobante para ${event}. Lo estamos revisando y en breve te confirmamos. ¡Gracias!`;
    case "approved":
      return `¡Hola ${name}! Tu reserva para ${event} el ${eventAt} está CONFIRMADA. Te esperamos. ¡Gracias!`;
    case "rejected": {
      const reason = input.rejectionReason ? ` ${input.rejectionReason}` : "";
      return `¡Hola ${name}! No pudimos confirmar tu reserva para ${event}.${reason} Si querés, escribinos y vemos cómo ayudarte.`;
    }
    case "expired":
      return `¡Hola ${name}! Se venció el plazo para tu reserva de ${event} y el lugar se liberó. Si todavía querés venir, avisanos y vemos si quedan lugares.`;
    case "cancelled":
    default:
      // Generic contact message for any state without its own wording.
      return `¡Hola ${name}! Te escribimos por tu reserva para ${event}. Si necesitás algo, respondé este mensaje y te ayudamos. ¡Gracias!`;
  }
}