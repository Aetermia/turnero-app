"use client";

import { useActionState } from "react";
import {
  type ReservationActionState,
  rejectReservationAction,
} from "./actions";

/*
 * Rejection form for a `pending_review` reservation. It is a Client Component
 * only because `useActionState` renders the errors the Server Action returns;
 * the textarea is plain HTML, so the form still works without a client store.
 *
 * The reason is optional, so the length cap is the only client-visible rule. The
 * Server Action validates it again — the browser attribute is convenience, not
 * the gate.
 */

const initialState: ReservationActionState = {
  fieldErrors: {},
  formError: null,
};

const textareaClass =
  "min-h-12 w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600";

export function RejectForm({ reservationId }: { reservationId: string }) {
  const [state, formAction, pending] = useActionState(
    rejectReservationAction,
    initialState,
  );
  const reasonError = state.fieldErrors.rejectionReason;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={reservationId} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="rejectionReason"
          className="font-semibold text-brand-800"
        >
          Motivo del rechazo (opcional)
        </label>
        <textarea
          id="rejectionReason"
          name="rejectionReason"
          rows={3}
          maxLength={500}
          placeholder="Por ejemplo: el monto transferido no coincide con el total."
          className={textareaClass}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? "rejectionReason-error" : undefined}
        />
        {reasonError ? (
          <p
            id="rejectionReason-error"
            className="text-sm font-medium text-accent-700"
          >
            {reasonError}
          </p>
        ) : null}
      </div>

      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"
        >
          {state.formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-accent-300 bg-white px-5 font-semibold text-accent-700 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending ? "Rechazando…" : "Rechazar reserva"}
      </button>
    </form>
  );
}
