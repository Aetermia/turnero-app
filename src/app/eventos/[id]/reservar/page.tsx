import Link from "next/link";
import { notFound } from "next/navigation";
import { ReservationForm } from "@/components/reservation-form";
import { getPublishedEventById } from "@/lib/events";
import { formatEventDate, formatEventTime, formatPrice } from "@/lib/format";
import { RESERVATION_HOLD_MINUTES } from "@/lib/reservations";

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
      <Link
        href={`/eventos/${event.id}`}
        className="text-sm font-semibold text-brand-700 hover:underline"
      >
        ← Volver al evento
      </Link>

      <header className="mt-4 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
          Reserva
        </span>
        <h1 className="text-2xl font-bold leading-snug text-brand-900 sm:text-3xl">
          Reservá tu lugar
        </h1>
        <p className="text-ink-soft">
          Te guardamos el lugar por {RESERVATION_HOLD_MINUTES} minutos mientras
          coordinás la transferencia.
        </p>
      </header>

      <dl className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-brand-100 bg-white p-5 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Evento</dt>
          <dd className="text-ink">{event.title}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Fecha y hora</dt>
          <dd className="capitalize text-ink">
            {formatEventDate(event.startsAt)},{" "}
            {formatEventTime(event.startsAt)} a{" "}
            {formatEventTime(event.endsAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Precio</dt>
          <dd className="font-semibold text-ink">{formatPrice(event.price)}</dd>
        </div>
      </dl>

      <ReservationForm eventId={event.id} />
    </div>
  );
}
