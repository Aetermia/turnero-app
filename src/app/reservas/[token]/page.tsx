import { notFound } from "next/navigation";
import { formatEventDate, formatEventTime, formatPrice } from "@/lib/format";
import { getReservationByToken } from "@/lib/reservations";
import { ReceiptUpload } from "@/components/receipt-upload";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { eq } from "drizzle-orm";

/*
 * Public, no-login page reached with the secret token. Awaits `params` and the
 * live reservation before rendering, so it cannot be prerendered with stale data.
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

  // Fetch full reservation details including transfer data
  const fullReservation = await db
    .select()
    .from(reservations)
    .where(eq(reservations.publicToken, token))
    .limit(1);

  const paymentAlias = process.env.PAYMENT_ALIAS?.trim();
  const isHeld = fullReservation[0]?.status === "pending_no_receipt";
  const isPendingReview = fullReservation[0]?.status === "pending_review";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
          Reserva
        </span>
        <h1 className="text-2xl font-bold leading-snug text-brand-900 sm:text-3xl">
          {isHeld
            ? "Te guardamos el lugar"
            : isPendingReview
              ? "Tu reserva está en revisión"
              : "Tu reserva está registrada"}
        </h1>
        {isHeld && fullReservation[0]?.expiresAt ? (
          <p className="text-ink-soft">
            Tenés tiempo hasta el{" "}
            <strong className="text-ink">
              {formatEventDate(fullReservation[0].expiresAt)} a las{" "}
              {formatEventTime(fullReservation[0].expiresAt)}
            </strong>{" "}
            para transferir el pago. Pasado ese plazo, el lugar se libera solo.
          </p>
        ) : isPendingReview ? (
          <p className="text-ink-soft">
            Ya recibimos tu comprobante y los datos de la transferencia. Estamos
            revisando la reserva. Te avisaremos por el canal correspondiente.
          </p>
        ) : null}
      </header>

      <dl className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-brand-100 bg-white p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Evento</dt>
          <dd className="text-ink">{reservation.eventTitle}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-semibold text-brand-700">Fecha</dt>
          <dd className="capitalize text-ink">
            {formatEventDate(reservation.eventStartsAt)} a las{" "}
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

      {isPendingReview && fullReservation[0] && (
        <section className="mt-6 flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-5">
          <h2 className="font-semibold text-brand-800">Datos enviados</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">Titular</dt>
              <dd className="text-ink">{fullReservation[0].transferHolder || "-"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">Monto declarado</dt>
              <dd className="text-ink">
                {fullReservation[0].transferAmount
                  ? formatPrice(fullReservation[0].transferAmount)
                  : "-"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">Fecha de transferencia</dt>
              <dd className="text-ink">{fullReservation[0].transferDate || "-"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-brand-700">N° de operación</dt>
              <dd className="text-ink">
                {fullReservation[0].transferReference || "-"}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-ink-soft">
            Comprobante subido. Estamos esperando la revisión del equipo.
          </p>
        </section>
      )}

      {!isHeld && !isPendingReview && (
        <p className="mt-6 text-ink-soft">
          Ya no hay una retención activa para este enlace. Si necesitás ayuda,
          escribinos por WhatsApp.
        </p>
      )}

      <p className="mt-6 text-xs text-ink-soft">
        Guardá este enlace: es la forma de consultar el estado de tu reserva.
      </p>
    </div>
  );
}
