import { Suspense } from "react";
import { EventCard } from "@/components/event-card";
import { getUpcomingPublishedEvents } from "@/lib/events";

/**
 * Reads the live catalog at request time. There is no `use cache` directive on
 * purpose: a cached seat count would let the app oversell an event. The read is
 * wrapped in <Suspense> so the rest of the page stays prerenderable.
 */
async function UpcomingEvents() {
  const upcoming = await getUpcomingPublishedEvents();

  if (upcoming.length === 0) {
    return (
      <p className="rounded-lg border border-brand-100 bg-white p-6 text-center text-ink-soft">
        Todavía no hay eventos programados. Volvé pronto para conocer las
        próximas actividades.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-8">
      {upcoming.map((event) => (
        <li key={event.id}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  );
}

function UpcomingEventsFallback() {
  return (
    <p className="py-10 text-center text-ink-soft">Cargando próximos eventos…</p>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <section className="mb-6 flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold text-brand-900 sm:text-5xl">
          Próximos eventos
        </h1>
        <p className="text-ink-soft">
          Elegí un encuentro y reservá tu lugar. El pago se realiza por
          transferencia bancaria.
        </p>
      </section>

      <Suspense fallback={<UpcomingEventsFallback />}>
        <UpcomingEvents />
      </Suspense>
    </div>
  );
}
