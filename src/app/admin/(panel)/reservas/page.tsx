import Link from "next/link";
import { reservationStatus } from "@/db/schema";
import { listEventsForAdmin } from "@/lib/events";
import {
  formatDateTime,
  formatEventDate,
  formatEventTime,
  formatReservationStatus,
} from "@/lib/format";
import { parseAdminReservationFilters } from "@/lib/reservation-admin-schema";
import {
  type ReservationStatus,
  listReservationsForAdmin,
} from "@/lib/reservations";

/*
 * Live list of every reservation, newest first, filtered by event and status
 * through the query string. The panel layout already requires a session, so the
 * data is read directly. Health data is never rendered here: it belongs to the
 * detail page.
 *
 * Reading `searchParams` makes the route dynamic, so it opts into a blocking
 * route like the login page.
 */

export const instant = false;

const STATUS_BADGE_CLASSES: Record<ReservationStatus, string> = {
  pending_no_receipt: "bg-brand-50 text-brand-700",
  pending_review: "bg-accent-50 text-accent-700",
  approved: "bg-brand-700 text-white",
  rejected: "bg-accent-700 text-white",
  expired: "bg-brand-50 text-ink-soft",
  cancelled: "bg-brand-50 text-ink-soft",
};

const selectClass =
  "min-h-10 w-full rounded-md border border-brand-200 bg-white px-3 text-sm text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600";

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; status?: string }>;
}) {
  const filters = parseAdminReservationFilters(await searchParams);

  const [reservations, events] = await Promise.all([
    listReservationsForAdmin(filters),
    listEventsForAdmin(),
  ]);

  const hasFilters = Boolean(filters.eventId || filters.status);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
          Reservas
        </span>
        <h1 className="text-2xl font-bold text-brand-900">Reservas</h1>
        <p className="text-ink-soft">
          Aprobar confirma el pago y mantiene el lugar ocupado; rechazar lo
          libera solo.
        </p>
      </header>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label
            htmlFor="eventId"
            className="text-sm font-semibold text-brand-800"
          >
            Evento
          </label>
          <select
            id="eventId"
            name="eventId"
            defaultValue={filters.eventId ?? ""}
            className={selectClass}
          >
            <option value="">Todos los eventos</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label
            htmlFor="status"
            className="text-sm font-semibold text-brand-800"
          >
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filters.status ?? ""}
            className={selectClass}
          >
            <option value="">Todos los estados</option>
            {reservationStatus.enumValues.map((status) => (
              <option key={status} value={status}>
                {formatReservationStatus(status)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Filtrar
          </button>
          {hasFilters ? (
            <Link
              href="/admin/reservas"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      {reservations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft">
          {hasFilters
            ? "No hay reservas que coincidan con el filtro."
            : "Todavía no hay reservas cargadas."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reservations.map((reservation) => (
            <li
              key={reservation.id}
              className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-brand-900">
                    {reservation.customerFullName}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[reservation.effectiveStatus]}`}
                  >
                    {formatReservationStatus(reservation.effectiveStatus)}
                  </span>
                </div>
                <span className="text-sm text-ink-soft">
                  {reservation.eventTitle} ·{" "}
                  {formatEventDate(reservation.eventStartsAt)}{" "}
                  {formatEventTime(reservation.eventStartsAt)}
                </span>
                <span className="text-sm text-ink-soft">
                  {reservation.customerEmail} · {reservation.customerWhatsapp}
                </span>
                <span className="text-xs text-ink-soft">
                  Reservada el {formatDateTime(reservation.createdAt)} ·{" "}
                  {reservation.hasReceipt
                    ? "con comprobante"
                    : "sin comprobante"}
                </span>
              </div>

              <Link
                href={`/admin/reservas/${reservation.id}`}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                Ver detalle
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
