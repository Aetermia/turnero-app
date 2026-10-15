import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import { ReservationForm } from "@/components/reservation-form";
import { getPublishedEventById } from "@/lib/events";
import {
  capitalizeFirst,
  formatEventDate,
  formatEventTimeRange,
  formatPrice,
} from "@/lib/format";
import { RESERVATION_HOLD_MINUTES } from "@/lib/reservations";
import { themeTone } from "@/lib/theme-tone";

/*
 * Same reasoning as the event detail page: this route awaits `params` and the
 * live event before rendering, and it must not cache a seat count. `instant =
 * false` only silences instant-navigation validation.
 */
export const instant = false;

export default async function ReservationPage({
  params,
}: PageProps<"/eventos/[id]/reservar">) {
  const { id } = await params;
  const event = await getPublishedEventById(id);

  // A draft, a missing event, or one that already started cannot be reserved.
  if (!event || event.startsAt.getTime() <= Date.now()) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <BackLink href={`/eventos/${event.id}`}>Volver al evento</BackLink>

      <header className="mt-6 flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">
          Paso 1 de 2 · Tus datos
        </p>
        <h1 className="font-display text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">
          Completá tus datos
        </h1>

      </header>

      <section
        aria-label="Evento elegido"
        className={`mt-6 flex flex-col gap-1 rounded-lg border border-brand-100 p-5 ${themeTone(event.theme).surface}`}
      >
        <p className="font-display text-xl font-semibold leading-tight text-brand-900">
          {event.title}
        </p>
        <p className="text-sm text-ink-soft">
          {capitalizeFirst(formatEventDate(event.startsAt))} ·{" "}
          {formatEventTimeRange(event.startsAt, event.endsAt)}
        </p>
        <p className="text-sm font-semibold text-brand-700">
          {formatPrice(event.price)}
        </p>
      </section>

      <ReservationForm
        eventId={event.id}
        holdMinutes={RESERVATION_HOLD_MINUTES}
      />
    </div>
  );
}
