import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventForAdminById } from "@/lib/events";
import { updateEventAction } from "../actions";
import { toDateTimeLocalValue } from "../datetime";
import { EventForm } from "../event-form";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventForAdminById(id);

  if (!event) {
    notFound();
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/eventos"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Volver a eventos
        </Link>
        <h1 className="text-2xl font-bold text-brand-900">Editar evento</h1>
        <p className="text-sm text-ink-soft">
          {event.occupied} de {event.capacity} lugares ocupados. No podés bajar
          la capacidad por debajo de los lugares ya ocupados.
        </p>
      </div>

      <EventForm
        action={updateEventAction}
        submitLabel="Guardar cambios"
        initialValues={{
          id: event.id,
          title: event.title,
          theme: event.theme ?? "",
          description: event.description ?? "",
          location: event.location ?? "",
          startsAt: toDateTimeLocalValue(event.startsAt),
          endsAt: toDateTimeLocalValue(event.endsAt),
          capacity: String(event.capacity),
          price: event.price,
          isPublished: event.isPublished,
        }}
      />
    </section>
  );
}
