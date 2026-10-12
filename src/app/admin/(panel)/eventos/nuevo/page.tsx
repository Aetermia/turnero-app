import Link from "next/link";
import { createEventAction } from "../actions";
import { EventForm } from "../event-form";

export default function NewEventPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/eventos"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Volver a eventos
        </Link>
        <h1 className="text-2xl font-bold text-brand-900">Nuevo evento</h1>
        <p className="text-ink-soft">
          Completá los datos y decidí si querés publicarlo en el catálogo.
        </p>
      </div>

      <EventForm
        action={createEventAction}
        submitLabel="Crear evento"
        initialValues={{
          id: null,
          title: "",
          theme: "",
          description: "",
          location: "",
          startsAt: "",
          endsAt: "",
          capacity: "",
          price: "",
          isPublished: false,
        }}
      />
    </section>
  );
}
