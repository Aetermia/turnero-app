import Link from "next/link";
import { listEventsForAdmin } from "@/lib/events";
import { formatEventDate, formatEventTime, formatPrice } from "@/lib/format";
import { toggleEventPublishedAction } from "./actions";

/*
 * Live list of every event, drafts included. The panel layout already requires a
 * session, so this reads the data directly and never caches a seat count.
 */

export default async function AdminEventsPage() {
  const events = await listEventsForAdmin();

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
            Eventos
          </span>
          <h1 className="text-2xl font-bold text-brand-900">Eventos</h1>
          <p className="text-ink-soft">
            Creá, editá y publicá los encuentros del local.
          </p>
        </div>

        <Link
          href="/admin/eventos/nuevo"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          Nuevo evento
        </Link>
      </header>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft">
          Todavía no hay eventos cargados. Creá el primero con el botón «Nuevo
          evento».
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-brand-900">
                    {event.title}
                  </span>
                  <span
                    className={
                      event.isPublished
                        ? "rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
                        : "rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-700"
                    }
                  >
                    {event.isPublished ? "Publicado" : "Borrador"}
                  </span>
                </div>
                {event.theme ? (
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
                    {event.theme}
                  </span>
                ) : null}
                <span className="text-sm capitalize text-ink-soft">
                  {formatEventDate(event.startsAt)},{" "}
                  {formatEventTime(event.startsAt)} a{" "}
                  {formatEventTime(event.endsAt)}
                </span>
                <span className="text-sm text-ink-soft">
                  {event.occupied} de {event.capacity} lugares ocupados ·{" "}
                  {formatPrice(event.price)}
                </span>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link
                  href={`/admin/eventos/${event.id}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  Editar
                </Link>

                <form action={toggleEventPublishedAction}>
                  <input type="hidden" name="id" value={event.id} />
                  <input
                    type="hidden"
                    name="publish"
                    value={event.isPublished ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-9 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    {event.isPublished ? "Despublicar" : "Publicar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
