"use client";

import { useActionState, useState } from "react";
import {
  createReservationAction,
  type ReservationFormState,
} from "@/app/eventos/[id]/reservar/actions";
import { ReservationTerms } from "@/components/reservation-terms";

const initialState: ReservationFormState = { fieldErrors: {}, formError: null };

const inputClass =
  "min-h-12 w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600";

const checkboxClass =
  "mt-1 h-5 w-5 shrink-0 rounded border-brand-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="text-sm font-medium text-accent-700">
      {message}
    </p>
  );
}

function FieldHint({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} className="text-sm text-ink-soft">
      {children}
    </p>
  );
}

export function ReservationForm({
  eventId,
  holdMinutes,
}: {
  eventId: string;
  holdMinutes: number;
}) {
  const [state, formAction, pending] = useActionState(
    createReservationAction,
    initialState,
  );
  const [healthAnswer, setHealthAnswer] = useState<"yes" | "no" | null>(null);

  const errors = state.fieldErrors;
  const asksForCondition = healthAnswer === "yes";

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-6">
      <input type="hidden" name="eventId" value={eventId} />

      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className="font-semibold text-brand-800">
          Nombre y apellido
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          autoComplete="name"
          className={inputClass}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
        <FieldError id="fullName-error" message={errors.fullName} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-semibold text-brand-800">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          className={inputClass}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="whatsapp" className="font-semibold text-brand-800">
          Número de teléfono
        </label>
        <FieldHint id="whatsapp-hint">
          Te escribimos por WhatsApp a este número para confirmar tu lugar.
        </FieldHint>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          placeholder="Ej: 2494 15 123456"
          className={inputClass}
          aria-invalid={errors.whatsapp ? true : undefined}
          aria-describedby={
            errors.whatsapp ? "whatsapp-hint whatsapp-error" : "whatsapp-hint"
          }
        />
        <FieldError id="whatsapp-error" message={errors.whatsapp} />
      </div>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby="hasHealthCondition-hint"
      >
        <legend className="font-semibold text-brand-800">
          ¿Tenés alguna condición de salud que debamos tener en cuenta?
        </legend>
        <FieldHint id="hasHealthCondition-hint">
          Por ejemplo: celiaquía, diabetes, alergias o movilidad reducida.
        </FieldHint>
        <label className="flex items-center gap-2 text-ink">
          <input
            type="radio"
            name="hasHealthCondition"
            value="yes"
            required
            checked={healthAnswer === "yes"}
            onChange={() => setHealthAnswer("yes")}
            className="h-5 w-5 border-brand-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          />
          Sí
        </label>
        <label className="flex items-center gap-2 text-ink">
          <input
            type="radio"
            name="hasHealthCondition"
            value="no"
            required
            checked={healthAnswer === "no"}
            onChange={() => setHealthAnswer("no")}
            className="h-5 w-5 border-brand-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          />
          No
        </label>
        <FieldError
          id="hasHealthCondition-error"
          message={errors.hasHealthCondition}
        />

        {asksForCondition ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <label
              htmlFor="healthCondition"
              className="font-semibold text-brand-800"
            >
              Contanos cuál
            </label>
            <textarea
              id="healthCondition"
              name="healthCondition"
              required
              rows={3}
              className={inputClass}
              aria-invalid={errors.healthCondition ? true : undefined}
              aria-describedby={
                errors.healthCondition
                  ? "healthCondition-error healthCondition-note"
                  : "healthCondition-note"
              }
            />
            <FieldError
              id="healthCondition-error"
              message={errors.healthCondition}
            />
            <p id="healthCondition-note" className="text-sm text-ink-soft">
              Este dato es sensible. Lo usamos solo para cuidarte durante el
              evento; nunca con fines de marketing ni lo compartimos con
              terceros.
            </p>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-4 rounded-lg border border-brand-100 bg-white p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-3">
            <input
              id="acceptedTerms"
              name="acceptedTerms"
              type="checkbox"
              required
              className={checkboxClass}
              aria-invalid={errors.acceptedTerms ? true : undefined}
              aria-describedby={
                errors.acceptedTerms ? "acceptedTerms-error" : undefined
              }
            />
            <label htmlFor="acceptedTerms" className="text-sm text-ink">
              Leí y acepto los términos y condiciones de la reserva.
            </label>
          </div>
          <FieldError id="acceptedTerms-error" message={errors.acceptedTerms} />
          <details className="group ml-8 mt-1">
            <summary className="w-fit cursor-pointer text-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
              <span className="group-open:hidden">
                Ver términos y condiciones
              </span>
              <span className="hidden group-open:inline">
                Ocultar términos y condiciones
              </span>
            </summary>
            <div className="mt-3">
              <ReservationTerms holdMinutes={holdMinutes} />
            </div>
          </details>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="marketingConsent"
            name="marketingConsent"
            type="checkbox"
            className={checkboxClass}
          />
          <label htmlFor="marketingConsent" className="text-sm text-ink">
            Quiero recibir novedades y próximos eventos por email (opcional).
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-800 sm:w-auto sm:px-8"
        >
          {pending ? "Enviando…" : "Continuar al pago"}
        </button>
        <p className="text-sm text-ink-soft">
          En el siguiente paso vas a ver el alias para transferir y subir el
          comprobante.
        </p>
      </div>
    </form>
  );
}
