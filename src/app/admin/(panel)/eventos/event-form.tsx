"use client";

import { useActionState } from "react";
import type { EventFormState } from "./actions";

/*
 * Shared form for creating and editing an event. It is a Client Component only
 * because it renders the per-field errors the Server Action returns; the inputs
 * themselves are plain HTML, so the form still submits without client state.
 */

export type EventFormInitialValues = {
  id: string | null;
  title: string;
  theme: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  price: string;
  isPublished: boolean;
};

const initialState: EventFormState = { fieldErrors: {}, formError: null };

const inputClass =
  "min-h-12 w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600";

const labelClass = "font-semibold text-brand-800";

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

export function EventForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (state: EventFormState, formData: FormData) => Promise<EventFormState>;
  initialValues: EventFormInitialValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {initialValues.id ? (
        <input type="hidden" name="id" value={initialValues.id} />
      ) : null}

      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={labelClass}>
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={initialValues.title}
          className={inputClass}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? "title-error" : undefined}
        />
        <FieldError id="title-error" message={errors.title} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="theme" className={labelClass}>
          Temática (opcional)
        </label>
        <input
          id="theme"
          name="theme"
          type="text"
          defaultValue={initialValues.theme}
          className={inputClass}
          aria-invalid={errors.theme ? true : undefined}
          aria-describedby={errors.theme ? "theme-error" : undefined}
        />
        <FieldError id="theme-error" message={errors.theme} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClass}>
          Descripción (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initialValues.description}
          className={inputClass}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? "description-error" : undefined}
        />
        <FieldError id="description-error" message={errors.description} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="location" className={labelClass}>
          Lugar (opcional)
        </label>
        <input
          id="location"
          name="location"
          type="text"
          defaultValue={initialValues.location}
          className={inputClass}
          aria-invalid={errors.location ? true : undefined}
          aria-describedby={errors.location ? "location-error" : undefined}
        />
        <FieldError id="location-error" message={errors.location} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startsAt" className={labelClass}>
            Inicio
          </label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={initialValues.startsAt}
            className={inputClass}
            aria-invalid={errors.startsAt ? true : undefined}
            aria-describedby={errors.startsAt ? "startsAt-error" : undefined}
          />
          <FieldError id="startsAt-error" message={errors.startsAt} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="endsAt" className={labelClass}>
            Fin
          </label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={initialValues.endsAt}
            className={inputClass}
            aria-invalid={errors.endsAt ? true : undefined}
            aria-describedby={errors.endsAt ? "endsAt-error" : undefined}
          />
          <FieldError id="endsAt-error" message={errors.endsAt} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="capacity" className={labelClass}>
            Capacidad
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            required
            inputMode="numeric"
            defaultValue={initialValues.capacity}
            className={inputClass}
            aria-invalid={errors.capacity ? true : undefined}
            aria-describedby={errors.capacity ? "capacity-error" : undefined}
          />
          <FieldError id="capacity-error" message={errors.capacity} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className={labelClass}>
            Precio por persona
          </label>
          <input
            id="price"
            name="price"
            type="text"
            required
            inputMode="decimal"
            defaultValue={initialValues.price}
            className={inputClass}
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={errors.price ? "price-error" : undefined}
          />
          <FieldError id="price-error" message={errors.price} />
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-brand-100 bg-white p-5">
        <input
          id="isPublished"
          name="isPublished"
          type="checkbox"
          defaultChecked={initialValues.isPublished}
          className="mt-1 h-5 w-5 shrink-0 rounded border-brand-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        />
        <label htmlFor="isPublished" className="text-sm text-ink">
          Publicar el evento en el catálogo público. Si no lo marcás, queda como
          borrador y solo lo ves vos.
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-800 sm:w-auto sm:px-8"
      >
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
