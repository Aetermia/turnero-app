"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import {
  type RejectionFormField,
  rejectionSchema,
} from "@/lib/reservation-admin-schema";
import { approveReservation, rejectReservation } from "@/lib/reservations";

/*
 * Server Actions for resolving a reservation. All writes go through here; there
 * is no API route. Proxy already gates `/admin`, and each action re-checks the
 * session as defense in depth, because an action is a POST endpoint of its own
 * and must not rely on the layout alone.
 */

export type ReservationActionState = {
  fieldErrors: Partial<Record<RejectionFormField, string>>;
  formError: string | null;
};

function isRejectionField(value: unknown): value is RejectionFormField {
  return value === "rejectionReason";
}

/**
 * Approves a reservation that is `pending_review`. Never touches seat counts.
 *
 * A plain form has nowhere to return a message, so a failure to match a row
 * (double click, second tab, already resolved) redirects back to the detail page
 * with an `error` code the page reads — the same idiom the login action uses.
 */
export async function approveReservationAction(
  formData: FormData,
): Promise<void> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const id = String(formData.get("id") ?? "");
  const approved = await approveReservation(id);

  if (!approved) {
    redirect(`/admin/reservas/${id}?error=not_pending`);
  }

  revalidatePath("/admin/reservas");
  revalidatePath(`/admin/reservas/${id}`);
}

/** Rejects a `pending_review` reservation with an optional reason. */
export async function rejectReservationAction(
  _prevState: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const id = String(formData.get("id") ?? "");
  const parsed = rejectionSchema.safeParse({
    // A hand-crafted POST can omit the field; `get` then returns `null`, which
    // `z.string().optional()` rejects. Normalizing to `undefined` makes "field
    // absent" mean "no reason", exactly like an empty textarea.
    rejectionReason: formData.get("rejectionReason") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<RejectionFormField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (isRejectionField(key)) {
        fieldErrors[key] ??= issue.message;
      }
    }
    return { fieldErrors, formError: null };
  }

  const rejected = await rejectReservation(id, parsed.data.rejectionReason);
  if (!rejected) {
    return {
      fieldErrors: {},
      formError:
        "La reserva ya no está pendiente de revisión. Recargá la página para ver su estado actual.",
    };
  }

  revalidatePath("/admin/reservas");
  revalidatePath(`/admin/reservas/${id}`);
  return { fieldErrors: {}, formError: null };
}
