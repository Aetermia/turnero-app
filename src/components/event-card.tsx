import Link from "next/link";
import type { EventWithSeats } from "@/lib/events";
import {
  capitalizeFirst,
  formatEventDate,
  formatEventTimeRange,
  formatPrice,
} from "@/lib/format";
import { themeTone } from "@/lib/theme-tone";

/**
 * Presentational card for one event in the public catalog. The whole card is a
 * single link, which keeps the tap target large on phones.
 */
export function EventCard({ event }: { event: EventWithSeats }) {
  const isFull = event.seatsAvailable === 0;

  return (
    <Link
      href={`/eventos/${event.id}`}
      className={`group flex h-full flex-col gap-3 rounded-lg border border-brand-100 p-5 shadow-sm ${themeTone(event.theme).surface} transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600`}
    >
      <header className="flex flex-col gap-1">
        {event.theme ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
            {event.theme}
          </span>
        ) : null}
        <h2 className="font-display text-2xl font-semibold leading-tight text-brand-900">
          {event.title}
        </h2>
      </header>

      <dl className="flex flex-col gap-1 text-sm text-ink-soft">
        <div>
          <dt className="sr-only">Fecha y hora</dt>
          <dd>
            {capitalizeFirst(formatEventDate(event.startsAt))} ·{" "}
            {formatEventTimeRange(event.startsAt, event.endsAt)}
          </dd>
        </div>
        {event.location ? (
          <div>
            <dt className="sr-only">Lugar</dt>
            <dd>{event.location}</dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">Precio</dt>
          <dd className="font-semibold text-brand-700">
            {formatPrice(event.price)}
          </dd>
        </div>
      </dl>

      <p
        className={
          isFull
            ? "text-sm font-semibold text-accent-700"
            : "text-sm font-medium text-brand-600"
        }
      >
        {isFull
          ? "Sin lugares disponibles"
          : `${event.seatsAvailable} de ${event.capacity} lugares disponibles`}
      </p>

      <span
        className={
          isFull
            ? "mt-auto inline-flex min-h-12 items-center justify-center rounded-md bg-brand-100 px-5 text-center font-semibold text-brand-700"
            : "mt-auto inline-flex min-h-12 items-center justify-center rounded-md bg-brand-700 px-5 text-center font-semibold text-white transition-colors group-hover:bg-brand-800"
        }
      >
        {isFull ? "Evento completo" : "Reservar mi lugar"}
      </span>
    </Link>
  );
}
