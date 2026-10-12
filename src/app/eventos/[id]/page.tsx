import Link from "next/link";
import { notFound } from "next/navigation";
import type { EventWithSeats } from "@/lib/events";
import { getPublishedEventById } from "@/lib/events";
import { formatEventDate, formatEventTime, formatPrice } from "@/lib/format";

/*
 * This route is allowed to block: it awaits `params` and the live seat count
 * before rendering, and it must not cache that count (a stale count would
 * oversell the event). `instant = false` only silences instant-navigation
 * validation; per the Next.js docs it does not change the rendering model or
 * prevent prerendering.
 */
export const instant = false;

/**
 * Presentational body of the detail page. Kept as a plain component so the
 * fetch and the `notFound()` check happen in the page, before any streaming
 * starts (see the note in EventPage below).
 */
function EventDetail({ event }: { event: EventWithSeats }) {
  const isFull = event.seatsAvailable === 0;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {event.theme ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
            {event.theme}
          </span>
        ) : null}
        <h1 className="text-2xl font-bold leading-snug text-brand-900 sm:text-3xl">
          {event.title}
        </h1>
      </header>

      {event.description ? (
        <p className="text-ink-soft">{event.description}</p>
      ) : null}

      <dl className="grid grid-cols-1 gap-4 rounded-lg border border-brand-100 bg-white p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Fecha</dt>
          <dd className="capitalize text-ink">{formatEventDate(event.startsAt)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Horario</dt>
          <dd className="text-ink">
            {formatEventTime(event.startsAt)} a {formatEventTime(event.endsAt)}
          </dd>
        </div>
        {event.location ? (
          <div className="flex flex-col gap-0.5">
            <dt className="font-semibold text-brand-700">Lugar</dt>
            <dd className="text-ink">{event.location}</dd>
          </div>
        ) : null}
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Precio</dt>
          <dd className="font-semibold text-ink">{formatPrice(event.price)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Lugares disponibles</dt>
          <dd className={isFull ? "font-semibold text-accent-700" : "text-ink"}>
            {isFull
              ? "Sin lugares disponibles"
              : `${event.seatsAvailable} de ${event.capacity}`}
          </dd>
        </div>
      </dl>

      {/*
       * When the event is full the CTA stays a disabled button; otherwise it
       * links to the reservation form created in T5.
       */}
      <div className="flex flex-col gap-2">
        {isFull ? (
          <button
            type="button"
            disabled
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-800 sm:w-auto sm:px-8"
          >
            Evento completo
          </button>
        ) : (
          <Link
            href={`/eventos/${event.id}/reservar`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto sm:px-8"
          >
            Reservar mi lugar
          </Link>
        )}
        <p className="text-sm text-ink-soft">
          {isFull
            ? "Este evento ya no tiene lugares disponibles."
            : "Te guardamos el lugar por 30 minutos para que puedas transferir el pago."}
        </p>
      </div>
    </article>
  );
}

export default async function EventPage({ params }: PageProps<"/eventos/[id]">) {
  const { id } = await params;
  const event = await getPublishedEventById(id);

  /*
   * Runs at the top level, before any <Suspense> boundary, so `notFound()`
   * executes before the page content streams.
   *
   * Caveat under `cacheComponents`: Next.js answers a request for an id that is
   * not known at build time with the prerendered fallback shell first (HTTP
   * 200) and streams this 404 in afterwards, so a draft never renders but the
   * status is a soft 404. Next.js marks it `noindex`, which keeps it out of
   * search results. A hard 404 status needs a request-time check in Proxy.
   */
  if (!event) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <EventDetail event={event} />
    </div>
  );
}
