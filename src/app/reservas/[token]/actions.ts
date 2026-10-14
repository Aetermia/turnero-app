"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { events, reservations } from "@/db/schema";
import { effectiveStatusSql } from "@/lib/reservations";
import {
  ALLOWED_RECEIPT_MIME_TYPES,
  MAX_RECEIPT_FILE_SIZE,
  RECEIPT_FORMATS_LABEL,
} from "@/lib/receipt";
import { createSignedUploadUrl } from "@/lib/storage";

export type UploadUrlFormState = {
  fieldErrors: Partial<Record<string, string>>;
  formError: string | null;
  success: boolean;
  data: {
    uploadUrl: string;
    path: string;
    contentType: string;
    expiresInSeconds: number;
  } | null;
};

const uploadUrlSchema = z.object({
  token: z.string().min(1, "Token de reserva inválido"),
  contentType: z.enum(ALLOWED_RECEIPT_MIME_TYPES, {
    message: `Formato no soportado. Permitidos: ${RECEIPT_FORMATS_LABEL}`,
  }),
  fileSize: z.number().min(1, "Archivo vacío").max(MAX_RECEIPT_FILE_SIZE, "El archivo supera los 8MB"),
  fileName: z.string().min(1),
});

export async function getSignedUploadUrl(
  _prevState: UploadUrlFormState,
  formData: FormData,
): Promise<UploadUrlFormState> {
  const parsed = uploadUrlSchema.safeParse({
    token: formData.get("token"),
    contentType: formData.get("contentType"),
    fileSize: formData.get("fileSize") ? Number(formData.get("fileSize")) : 0,
    fileName: formData.get("fileName"),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        fieldErrors[key] ??= issue.message;
      }
    }
    return {
      fieldErrors,
      formError: null,
      success: false,
      data: null,
    };
  }

  const { token, contentType, fileName } = parsed.data;

  const reservation = await db
    .select({
      id: reservations.id,
      publicToken: reservations.publicToken,
      effectiveStatus: effectiveStatusSql,
      receiptPath: reservations.receiptPath,
    })
    .from(reservations)
    .where(eq(reservations.publicToken, token))
    .limit(1);

  if (!reservation.length) {
    return {
      fieldErrors: {},
      formError: "Reserva no encontrada",
      success: false,
      data: null,
    };
  }

  const r = reservation[0];

  // Only allow upload if in pending_no_receipt and no receipt yet
  if (r.receiptPath) {
    return {
      fieldErrors: {},
      formError: "Ya se subió el comprobante para esta reserva",
      success: false,
      data: null,
    };
  }

  // The DB has already evaluated the hold timer; an expired hold is `expired`
  // here, so the deadline is never compared against the app's clock.
  if (r.effectiveStatus === "expired") {
    return {
      fieldErrors: {},
      formError: "La reserva ya expiró. No es posible completar el pago",
      success: false,
      data: null,
    };
  }

  if (r.effectiveStatus !== "pending_no_receipt") {
    return {
      fieldErrors: {},
      formError: "No es posible subir el comprobante en el estado actual",
      success: false,
      data: null,
    };
  }

  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  const safeContentType = contentType as (typeof ALLOWED_RECEIPT_MIME_TYPES)[number];

  try {
    const signed = await createSignedUploadUrl(
      r.id,
      r.publicToken,
      safeContentType,
      extension,
      600,
    );

    return {
      fieldErrors: {},
      formError: null,
      success: true,
      data: signed,
    };
  } catch (error) {
    // The storage error can name server configuration; the person on the
    // public page only needs to know it is worth trying again.
    console.error("Failed to create signed upload URL", error);
    return {
      fieldErrors: {},
      formError: "No pudimos preparar la subida del comprobante. Probá de nuevo en unos minutos.",
      success: false,
      data: null,
    };
  }
}

export type CompleteReservationFormState = {
  fieldErrors: Partial<Record<string, string>>;
  formError: string | null;
  success: boolean;
};

const completeReservationSchema = z.object({
  token: z.string().min(1, "Token inválido"),
  transferHolder: z.string().trim().min(1, "Ingresá el titular de la transferencia"),
  transferAmount: z
    .string()
    .trim()
    .min(1, "Ingresá el monto transferido")
    .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) || /^\d+(\,\d{1,2})?$/.test(val), {
      message: "Formato de monto inválido (ej. 15000 o 15000.50)",
    })
    .transform((val) => val.replace(",", ".")),
  transferDate: z.string().trim().min(1, "Ingresá la fecha de transferencia"),
  transferReference: z.string().trim().min(1, "Ingresá el número de operación"),
  receiptPath: z.string().min(1, "Falta el comprobante subido"),
  receiptMimeType: z.enum(ALLOWED_RECEIPT_MIME_TYPES, {
    message: "Formato de comprobante no soportado",
  }),
});

export async function completeReservationAction(
  _prevState: CompleteReservationFormState,
  formData: FormData,
): Promise<CompleteReservationFormState> {
  const parsed = completeReservationSchema.safeParse({
    token: formData.get("token"),
    transferHolder: formData.get("transferHolder"),
    transferAmount: formData.get("transferAmount"),
    transferDate: formData.get("transferDate"),
    transferReference: formData.get("transferReference"),
    receiptPath: formData.get("receiptPath"),
    receiptMimeType: formData.get("receiptMimeType"),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        fieldErrors[key] ??= issue.message;
      }
    }
    return {
      fieldErrors,
      formError: null,
      success: false,
    };
  }

  const data = parsed.data;

  const reservation = await db
    .select({
      id: reservations.id,
      publicToken: reservations.publicToken,
      effectiveStatus: effectiveStatusSql,
      receiptPath: reservations.receiptPath,
      eventId: reservations.eventId,
    })
    .from(reservations)
    .where(eq(reservations.publicToken, data.token))
    .limit(1);

  if (!reservation.length) {
    return {
      fieldErrors: {},
      formError: "Reserva no encontrada",
      success: false,
    };
  }

  const r = reservation[0];

  if (r.receiptPath && r.receiptPath !== data.receiptPath) {
    return {
      fieldErrors: {},
      formError: "El comprobante ya fue subido para esta reserva",
      success: false,
    };
  }

  // The DB evaluates the hold timer inside `effectiveStatus`; no JavaScript
  // clock is consulted, so the deadline cannot drift from the seat count.
  if (r.effectiveStatus === "expired") {
    return {
      fieldErrors: {},
      formError: "La reserva ya expiró. No es posible completar el pago",
      success: false,
    };
  }

  if (r.effectiveStatus !== "pending_no_receipt") {
    return {
      fieldErrors: {},
      formError: "No es posible completar la reserva en el estado actual",
      success: false,
    };
  }

  // Load event to compare price
  const event = await db
    .select({ price: events.price })
    .from(events)
    .where(eq(events.id, r.eventId))
    .limit(1);

  if (!event.length) {
    return {
      fieldErrors: {},
      formError: "Evento no encontrado",
      success: false,
    };
  }

  const eventPrice = Number(event[0].price);
  const declaredPrice = Number(data.transferAmount);
  
  // Allow small floating point differences but require reasonable match
  if (isNaN(eventPrice) || isNaN(declaredPrice) || Math.abs(eventPrice - declaredPrice) > 0.01) {
    return {
      fieldErrors: {},
      formError: `El monto declarado ($${declaredPrice.toFixed(2)}) no coincide con el total del evento ($${eventPrice.toFixed(2)}). Verificá el monto transferido.`,
      success: false,
    };
  }

  // Update reservation: pending_review, clear expiresAt, set transfer and receipt data
  await db
    .update(reservations)
    .set({
      status: "pending_review",
      expiresAt: null,
      transferHolder: data.transferHolder,
      transferAmount: data.transferAmount,
      transferDate: data.transferDate,
      transferReference: data.transferReference,
      receiptPath: data.receiptPath,
      receiptMimeType: data.receiptMimeType,
      receiptUploadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, r.id));

  revalidatePath(`/reservas/${r.publicToken}`);
  redirect(`/reservas/${r.publicToken}`);
}
