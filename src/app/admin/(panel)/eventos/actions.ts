"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import {
  EVENT_IMAGE_FORMATS_LABEL,
  MAX_EVENT_IMAGE_FILE_SIZE,
  eventImageExtension,
  isAllowedEventImageMimeType,
} from "@/lib/event-image";
import { eventSchema } from "@/lib/event-schema";
import {
  createEvent,
  getEventForAdminById,
  setEventImage,
  setEventPublished,
  updateEvent,
} from "@/lib/events";
import {
  createEventImageUploadUrl,
  deleteEventImageObject,
  eventImagePathFromPublicUrl,
  getEventImagePublicUrl,
  isEventImagePublicUrlForEvent,
} from "@/lib/storage";

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

/** State of the "upload a photo" step: the minted URL, or why there is none. */
export type EventImageUploadState = {
  uploadUrl: string | null;
  publicUrl: string | null;
  contentType: string | null;
  error: string | null;
};

/** State of the "store the photo" step. */
export type EventImageState = {
  ok: boolean;
  error: string | null;
};

/**
 * Mints a short-lived upload URL for one event's photo.
 *
 * The browser then PUTs the file straight to Storage, so the photo never
 * travels through the app server and the Server Action body limit stays out of
 * the way. Signing still matters even though the bucket is public: it scopes
 * the write to a single object path, and the service role key never leaves the
 * server.
 */
export async function requestEventImageUploadAction(
  _prevState: EventImageUploadState,
  formData: FormData,
): Promise<EventImageUploadState> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const fail = (error: string): EventImageUploadState => ({
    uploadUrl: null,
    publicUrl: null,
    contentType: null,
    error,
  });

  const eventId = String(formData.get("eventId") ?? "");
  const contentType = String(formData.get("contentType") ?? "");
  const fileSize = Number(formData.get("fileSize") ?? 0);

  if (!isAllowedEventImageMimeType(contentType)) {
    return fail(
      `Formato no soportado. Permitidos: ${EVENT_IMAGE_FORMATS_LABEL}`,
    );
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return fail("El archivo está vacío.");
  }

  if (fileSize > MAX_EVENT_IMAGE_FILE_SIZE) {
    return fail("La foto supera los 8MB.");
  }

  // The event has to exist before anything is minted for it: the object path is
  // built from its id, and a bad id must not be able to create its own folder.
  const event = await getEventForAdminById(eventId);
  if (!event) {
    return fail("El evento ya no existe.");
  }

  try {
    const signed = await createEventImageUploadUrl(
      eventId,
      contentType,
      eventImageExtension(contentType),
    );

    return {
      uploadUrl: signed.uploadUrl,
      publicUrl: getEventImagePublicUrl(signed.path),
      contentType: signed.contentType,
      error: null,
    };
  } catch (error) {
    // The storage error can name server configuration; the panel only needs to
    // know that trying again is worth it.
    console.error("Failed to create signed event image upload URL", error);
    return fail("No pudimos preparar la subida. Probá de nuevo en unos minutos.");
  }
}

/**
 * Stores the public URL the browser got back after uploading, or clears the
 * photo when the field arrives empty.
 *
 * The URL is validated again here, against our bucket and this event's folder.
 * The browser is the one handing it back, and although only an admin reaches
 * this action, a value pointing somewhere else must never reach the database.
 */
export async function setEventImageAction(
  _prevState: EventImageState,
  formData: FormData,
): Promise<EventImageState> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const eventId = String(formData.get("eventId") ?? "");
  const rawUrl = String(formData.get("imageUrl") ?? "").trim();
  const nextUrl = rawUrl.length > 0 ? rawUrl : null;

  const event = await getEventForAdminById(eventId);
  if (!event) {
    return { ok: false, error: "El evento ya no existe." };
  }

  if (nextUrl !== null && !isEventImagePublicUrlForEvent(nextUrl, eventId)) {
    return { ok: false, error: "La dirección de la foto no es válida." };
  }

  const saved = await setEventImage(eventId, nextUrl);
  if (!saved) {
    return { ok: false, error: "El evento ya no existe." };
  }

  /*
   * The old object is removed only after the row already points at the new one,
   * and only when it really changed. Deleting first would leave the event
   * without a photo if the update failed.
   */
  if (event.imageUrl && event.imageUrl !== nextUrl) {
    const previousPath = eventImagePathFromPublicUrl(event.imageUrl);
    if (previousPath) {
      await deleteEventImageObject(previousPath);
    }
  }

  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/eventos/${eventId}`);
  revalidatePath("/");
  revalidatePath(`/eventos/${eventId}`);

  return { ok: true, error: null };
}
