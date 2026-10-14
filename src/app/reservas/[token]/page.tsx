import Link from "next/link";
import { notFound } from "next/navigation";
import {
  capitalizeFirst,
  formatEventDate,
  formatEventTime,
  formatPrice,
} from "@/lib/format";
import { getReservationByToken } from "@/lib/reservations";
import { ReceiptUpload } from "@/components/receipt-upload";

/*
 * Public, no-login page reached with the secret token. Awaits `params` and the
 * live reservation before rendering, so it cannot be prerendered with stale data.
 *
 * The state it shows is the EFFECTIVE one: the database evaluates the hold timer
 * in the same query, so an abandoned hold reads as `expired` here even though its
 * stored status is still `pending_no_receipt`. One query only — this page never
 * re-reads the row.
 */
export const instant = false;

export default async function ReservationStatusPage({
  params,
}: PageProps<"/reservas/[token]">) {
  const { token } = await params;
  const reservation = await getReservationByToken(token);

  if (!reservation) {
    notFound();
  }

  const { effectiveStatus } = reservation;
  const paymentAlias = process.env.PAYMENT_ALIAS?.trim();
  const isHeld = effectiveStatus === "pending_no_receipt";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
          Reserva
        </span>
        <h1 className="font-display text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">
          {effectiveStatus === "pending_no_receipt"
            ? "Te guardamos el lugar"
            : effectiveStatus === "pending_review"
              ? "Tu reserva está en revisión"
              : effectiveStatus === "approved"
                ? "Tu reserva está confirmada"
                : effectiveStatus === "rejected"
                  ? "No pudimos confirmar tu pago"
                  : effectiveStatus === "expired"
                    ? "El plazo venció"
                    : "La reserva fue cancelada"}
        </h1>
        {isHeld ? (
          reservation.expiresAt ? (
            <p className="text-ink-soft">
              Tenés tiempo hasta el{" "}
              <strong className="text-ink">
                {formatEventDate(reservation.expiresAt)} a las{" "}
                {formatEventTime(reservation.expiresAt)}
              </strong>{" "}
              para transferir el pago. Pasado ese plazo, el lugar se libera solo.
            </p>
          ) : null
        ) : effectiveStatus === "pending_review" ? (
          <p className="text-ink-soft">
            Ya recibimos tu comprobante y los datos de la transferencia. Estamos
            revisando la reserva. Te avisaremos por el canal correspondiente.
          </p>
        ) : effectiveStatus === "approved" ? (
          <p className="text-ink-soft">
            Confirmamos tu pago y el lugar queda reservado a tu nombre. ¡Te
            esperamos!
          </p>
        ) : effectiveStatus === "rejected" ? (
          <p className="text-ink-soft">
            Revisamos el comprobante y no pudimos confirmar tu pago.
            {reservation.rejectionReason
              ? ` Motivo: ${reservation.rejectionReason}.`
              : ""}{" "}
            Si creés que es un error, escribinos por WhatsApp.
          </p>
        ) : effectiveStatus === "expired" ? (
          <p className="text-ink-soft">
            El plazo para transferir venció y el lugar se liberó. Si todavía
            querés venir, podés reservar de nuevo.
          </p>
        ) : (
          <p className="text-ink-soft">La reserva fue cancelada.</p>
        )}
      </header>

      <dl className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-brand-100 bg-white p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Evento</dt>
          <dd className="text-ink">{reservation.eventTitle}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Fecha</dt>
          <dd className="text-ink">
            {capitalizeFirst(formatEventDate(reservation.eventStartsAt))} a las{" "}
            {formatEventTime(reservation.eventStartsAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Total a transferir</dt>
          <dd className="font-semibold text-ink">
            {formatPrice(reservation.eventPrice)}
          </dd>
        </div>
      </dl>

      {isHeld && (
        <>
          <section className="mt-6 flex flex-col gap-2 rounded-lg border border-brand-100 bg-white p-5">
            <h2 className="font-semibold text-brand-800">Cómo pagar</h2>
            <p className="text-sm text-ink-soft">
              Transferí el total por Mercado Pago a este alias:
            </p>
            {paymentAlias ? (
              <p className="rounded-md bg-brand-50 px-4 py-3 text-lg font-semibold tracking-wide text-brand-800">
                {paymentAlias}
              </p>
            ) : (
              <p className="text-sm text-ink-soft">
                El alias de pago te lo comparte la organización por WhatsApp.
              </p>
            )}
          </section>

          <ReceiptUpload token={token} eventPrice={reservation.eventPrice} />
        </>
      )}

      {effectiveStatus === "pending_review" && (
        <section className="mt-6 flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-5">
          <h2 className="font-semibold text-brand-800">Datos enviados</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">Titular</dt>
              <dd className="text-ink">{reservation.transferHolder || "-"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">Monto declarado</dt>
              <dd className="text-ink">
                {reservation.transferAmount
                  ? formatPrice(reservation.transferAmount)
                  : "-"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">Fecha de transferencia</dt>
              <dd className="text-ink">{reservation.transferDate || "-"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">N° de operación</dt>
              <dd className="text-ink">{reservation.transferReference || "-"}</dd>
            </div>
          </dl>
          <p className="text-sm text-ink-soft">
            {reservation.hasReceipt
              ? "Comprobante subido. Estamos esperando la revisión del equipo."
              : "Estamos esperando la revisión del equipo."}
          </p>
        </section>
      )}

      {effectiveStatus === "expired" && (
        <Link
          href={`/eventos/${reservation.eventId}`}
          className="mt-6 inline-flex min-h-10 w-fit items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          Ver el evento y reservar de nuevo
        </Link>
      )}

      <p className="mt-6 text-xs text-ink-soft">
        Guardá este enlace: es la forma de consultar el estado de tu reserva.
      </p>
    </div>
  );
}
