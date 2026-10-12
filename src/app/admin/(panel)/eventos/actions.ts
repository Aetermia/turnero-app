"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { eventSchema } from "@/lib/event-schema";
import { createEvent, setEventPublished, updateEvent } from "@/lib/events";

/*
 * Server Actions for the event CRUD. All writes go through here; there is no
 * API route. Proxy already gates `/admin`, and each action re-checks the session
 * as defense in depth, because an action is a POST endpoint of its own and must
 * not rely on the layout alone.
 */

/** Fields the form renders, so a validation error can be tied to its input. */
const FIELD_NAMES = [
  "title",
  "theme",
  "description",
  "location",
  "startsAt",
  "endsAt",
  "capacity",
  "price",
  "isPublished",
] as const;

export type EventFormField = (typeof FIELD_NAMES)[number];

export type EventFormState = {
  fieldErrors: Partial<Record<EventFormField, string>>;
  formError: string | null;
};

function isEventFormField(value: unknown): value is EventFormField {
  return (
    typeof value === "string" &&
    (FIELD_NAMES as readonly string[]).includes(value)
  );
}

function parseEventForm(formData: FormData) {
  return eventSchema.safeParse({
    title: formData.get("title"),
    theme: formData.get("theme"),
    description: formData.get("description"),
    location: formData.get("location"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    capacity: formData.get("capacity"),
    price: formData.get("price"),
    isPublished: formData.get("isPublished"),
  });
}

function toErrorState(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): EventFormState {
  const fieldErrors: Partial<Record<EventFormField, string>> = {};
  let hasUnmappedError = false;

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (isEventFormField(key)) {
      // First message per field wins; later duplicates add nothing for the UI.
      fieldErrors[key] ??= issue.message;
    } else {
      hasUnmappedError = true;
    }
  }

  return {
    fieldErrors,
    formError: hasUnmappedError ? "Revisá los datos del formulario." : null,
  };
}

/** Validates the form server-side and inserts the event. */
export async function createEventAction(
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return toErrorState(parsed.error);
  }

  await createEvent(parsed.data);
  revalidatePath("/admin/eventos");
  redirect("/admin/eventos");
}

/** Validates the form server-side and updates the event, guarding capacity. */
export async function updateEventAction(
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const id = String(formData.get("id") ?? "");
  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return toErrorState(parsed.error);
  }

  const result = await updateEvent(id, parsed.data);
  if (!result.ok) {
    return {
      fieldErrors: {},
      formError:
        result.reason === "capacity_below_occupied"
          ? "No podés bajar la capacidad por debajo de los lugares ya ocupados."
          : "El evento ya no existe.",
    };
  }

  revalidatePath("/admin/eventos");
  redirect("/admin/eventos");
}

/** Publishes or unpublishes an event from the list. Leaves reservations alone. */
export async function toggleEventPublishedAction(
  formData: FormData,
): Promise<void> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const id = String(formData.get("id") ?? "");
  const publish = formData.get("publish") === "true";

  const updated = await setEventPublished(id, publish);
  if (updated) {
    revalidatePath("/admin/eventos");
  }
}
