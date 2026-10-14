import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  capitalizeFirst,
  formatDateTime,
  formatEventDate,
  formatEventTimeRange,
  formatIsoDate,
  formatPrice,
  formatReservationStatus,
} from "@/lib/format";
import {
  type ReservationStatus,
  getReservationForAdminById,
} from "@/lib/reservations";
import { isPdfReceipt } from "@/lib/receipt";
import { createSignedReceiptUrl } from "@/lib/storage";
import {
  buildReservationWhatsAppMessage,
  buildWhatsAppDeepLink,
} from "@/lib/whatsapp";
import { approveReservationAction } from "../actions";
import { RejectForm } from "../reject-form";

/*
 * Reservation detail, inside the authenticated panel only. It renders the two
 * sensitive fields the owner needs to organize the event — the declared health
 * condition and the transfer receipt — so it must never be linked from a public
 * page. The receipt is served through a short-lived signed URL, requested at
 * render time and never stored.
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

const cardClass = "flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-5";

const approveButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto sm:px-8";

const whatsappButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md border border-brand-200 bg-white px-5 font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto sm:px-8";

function DataItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-semibold text-brand-700">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/**
 * Requests a signed URL for the private receipt. When Supabase is unreachable or
 * not configured the page must still render, so a failure degrades to `null`
 * and the caller shows a message instead of a 500.
 */
async function signedReceiptUrl(path: string | null): Promise<string | null> {
  if (!path) {
    return null;
  }

  try {
    return await createSignedReceiptUrl(path);
  } catch {
    return null;
  }
}

export default async function AdminReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const reservation = await getReservationForAdminById(id);
  if (!reservation) {
    notFound();
  }

  const { customer, event } = reservation;
  const receiptUrl = await signedReceiptUrl(reservation.receiptPath);
  const canResolve = reservation.status === "pending_review";

  const whatsappMessage = buildReservationWhatsAppMessage({
    fullName: customer.fullName,
    eventTitle: event.title,
    eventStartsAt: event.startsAt,
    eventPrice: formatPrice(event.price),
    expiresAt: reservation.expiresAt,
    rejectionReason: reservation.rejectionReason,
    paymentAlias: process.env.PAYMENT_ALIAS?.trim() ?? null,
    effectiveStatus: reservation.effectiveStatus,
  });
  const whatsappLink = buildWhatsAppDeepLink(customer.whatsapp, whatsappMessage);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/reservas"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Volver a reservas
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-brand-900">
            {customer.fullName}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[reservation.effectiveStatus]}`}
          >
            {formatReservationStatus(reservation.effectiveStatus)}
          </span>
        </div>
        <p className="text-sm text-ink-soft">
          Reserva creada el {formatDateTime(reservation.createdAt)}.
          {reservation.resolvedAt
            ? ` Resuelta el ${formatDateTime(reservation.resolvedAt)}.`
            : reservation.effectiveStatus === "expired"
              ? ` El plazo de retención venció${
                  reservation.expiresAt
                    ? ` el ${formatDateTime(reservation.expiresAt)}`
                    : ""
                } y el lugar se liberó.`
              : reservation.expiresAt
                ? ` Retiene el lugar hasta el ${formatDateTime(reservation.expiresAt)}.`
                : ""}
        </p>
      </div>

      {error === "not_pending" ? (
        <p
          role="alert"
          className="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"
        >
          No pudimos aplicar el cambio: la reserva ya no está pendiente de
          revisión. Recargá la página para ver su estado actual.
        </p>
      ) : null}

      <section className={cardClass}>
        <h2 className="font-semibold text-brand-800">Datos del cliente</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DataItem label="Nombre">{customer.fullName}</DataItem>
          <DataItem label="Email">{customer.email}</DataItem>
          <DataItem label="WhatsApp">{customer.whatsapp}</DataItem>
          <DataItem label="Consentimiento de marketing">
            {customer.marketingConsent
              ? `Sí${
                  customer.marketingConsentAt
                    ? `, autorizó el ${formatDateTime(customer.marketingConsentAt)}`
                    : ""
                }`
              : "No autorizó"}
          </DataItem>
        </dl>
      </section>

      <section className={cardClass}>
        <h2 className="font-semibold text-brand-800">Contactar por WhatsApp</h2>
        {whatsappLink ? (
          <>
            <p className="text-sm text-ink-soft">
              Abre WhatsApp con un mensaje pre-armado según el estado actual de
              la reserva. Revisalo y editá el texto antes de enviarlo: el envío
              es manual, nada se manda solo.
            </p>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className={whatsappButtonClass}
            >
              Contactar por WhatsApp
            </a>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            El número {customer.whatsapp} no tiene un formato que WhatsApp pueda
            abrir. Corregilo en la ficha de contacto de la persona.
          </p>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="font-semibold text-brand-800">Evento</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DataItem label="Título">{event.title}</DataItem>
          <DataItem label="Temática">{event.theme || "-"}</DataItem>
          <DataItem label="Lugar">{event.location || "-"}</DataItem>
          <DataItem label="Fecha">
            {capitalizeFirst(formatEventDate(event.startsAt))} ·{" "}
            {formatEventTimeRange(event.startsAt, event.endsAt)}
          </DataItem>
          <DataItem label="Precio por persona">
            {formatPrice(event.price)}
          </DataItem>
          <DataItem label="Capacidad">{event.capacity} personas</DataItem>
        </dl>
      </section>

      <section className={cardClass}>
        <h2 className="font-semibold text-brand-800">
          Datos declarados de la transferencia
        </h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DataItem label="Titular">
            {reservation.transferHolder || "-"}
          </DataItem>
          <DataItem label="Monto declarado">
            {reservation.transferAmount
              ? formatPrice(reservation.transferAmount)
              : "-"}
          </DataItem>
          <DataItem label="Fecha de la transferencia">
            {reservation.transferDate
              ? formatIsoDate(reservation.transferDate)
              : "-"}
          </DataItem>
          <DataItem label="N° de operación">
            {reservation.transferReference || "-"}
          </DataItem>
        </dl>
        <p className="text-xs text-ink-soft">
          Son datos declarados por la persona. Conviene cruzarlos con el
          comprobante y con tu app bancaria.
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="font-semibold text-brand-800">Condición de salud</h2>
        {reservation.hasCondition ? (
          <>
            <p className="text-sm text-ink-soft">Declaró una condición:</p>
            <p className="rounded-md bg-accent-50 px-4 py-3 text-ink">
              {reservation.conditionDetails || "Sin detalle"}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            No declaró condiciones de salud.
          </p>
        )}
        <p className="text-xs text-ink-soft">
          Dato sensible (Ley 25.326): se usa solo para organizar el encuentro,
          no se comparte con terceros ni se usa para marketing.
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="font-semibold text-brand-800">Comprobante</h2>
        {reservation.receiptPath === null ? (
          <p className="text-sm text-ink-soft">
            Todavía no hay comprobante cargado para esta reserva.
          </p>
        ) : receiptUrl === null ? (
          <p className="text-sm text-ink-soft">
            No pudimos generar el enlace del comprobante. Volvé a intentar en
            unos minutos.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {isPdfReceipt(reservation.receiptMimeType)
                ? "Abrir el PDF en una pestaña nueva"
                : "Abrir en una pestaña nueva"}
            </a>
            {isPdfReceipt(reservation.receiptMimeType) ? (
              <p className="text-sm text-ink-soft">
                El comprobante es un PDF: abrilo con el botón de arriba.
              </p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- the URL is a short-lived signed link from a private bucket, so next/image optimization does not apply
              <img
                src={receiptUrl}
                alt="Comprobante de la transferencia"
                className="max-h-[32rem] w-full rounded-md border border-brand-100 object-contain"
              />
            )}
            {reservation.receiptUploadedAt ? (
              <p className="text-xs text-ink-soft">
                Subido el {formatDateTime(reservation.receiptUploadedAt)}.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="font-semibold text-brand-800">Resolución</h2>

        {canResolve ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold text-brand-800">Aprobar</h3>
              <p className="text-sm text-ink-soft">
                Confirma que el pago llegó. El lugar sigue ocupado, igual que
                antes de aprobar.
              </p>
              <form action={approveReservationAction}>
                <input type="hidden" name="id" value={reservation.id} />
                <button type="submit" className={approveButtonClass}>
                  Aprobar reserva
                </button>
              </form>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="font-semibold text-brand-800">Rechazar</h3>
              <p className="text-sm text-ink-soft">
                Libera el lugar automáticamente. El motivo queda registrado en
                la reserva.
              </p>
              <RejectForm reservationId={reservation.id} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-ink">
              Estado actual: {formatReservationStatus(reservation.effectiveStatus)}.
            </p>
            <p className="text-ink-soft">
              Solo las reservas en revisión se pueden aprobar o rechazar.
            </p>
            {reservation.status === "rejected" &&
            reservation.rejectionReason ? (
              <p className="text-ink-soft">
                Motivo del rechazo: {reservation.rejectionReason}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </section>
  );
}
