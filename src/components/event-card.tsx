import Image from "next/image";
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
 *
 * The card is laid out in one column, so each event gets the full width of the
 * page. The photo sits between the title and the details, as asked, and keeps
 * its 3:4 ratio at two thirds of the card width: full width made it so tall
 * that one event filled the screen. When an event has no photo yet the same
 * 3:4 box stays in place, filled with the tone of its theme, so the rhythm of
 * the list does not change and nothing looks broken.
 *
 * The description is not rendered here: the catalog shows date, place and
 * price, and the description lives on the detail page.
 */
export function EventCard({ event }: { event: EventWithSeats }) {
  const isFull = event.seatsAvailable === 0;
  const tone = themeTone(event.theme);

  return (
    <Link
      href={`/eventos/${event.id}`}
      className={`group flex h-full flex-col overflow-hidden rounded-lg border border-brand-100 shadow-sm ${tone.surface} transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600`}
    >
      <header className="flex flex-col gap-1 px-5 pt-6">
        {event.theme ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
            {event.theme}
          </span>
        ) : null}
        <h2 className="font-display text-3xl font-semibold leading-tight text-brand-900">
          {event.title}
        </h2>
      </header>

      <div
        className={`relative mx-auto mt-5 aspect-[3/4] w-2/3 ${tone.placeholder}`}
      >
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt=""
            fill
            sizes="(min-width: 800px) 491px, 66vw"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6 pt-5">
        <dl className="flex flex-col gap-1 text-base text-ink-soft">
          <div>
            <dt className="sr-only">Fecha y hora</dt>
            <dd className="font-semibold text-ink">
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
      </div>
    </Link>
  );
}
