"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  EVENT_IMAGE_FORMATS_LABEL,
  EVENT_IMAGE_JPEG_QUALITY,
  EVENT_IMAGE_MAX_DIMENSION,
  MAX_EVENT_IMAGE_FILE_SIZE,
  isAllowedEventImageMimeType,
} from "@/lib/event-image";
import { themeTone } from "@/lib/theme-tone";
import { requestEventImageUploadAction, setEventImageAction } from "./actions";
import type { EventImageState, EventImageUploadState } from "./actions";

/*
 * Photo management for one event, on the edit page.
 *
 * Uploading is the same two-step dance the payment receipt uses: a Server
 * Action mints a short-lived signed URL, the browser PUTs the file straight to
 * Storage, and a second Server Action stores the resulting public URL. The
 * photo never travels through the app server, which keeps the Server Action
 * body limit out of the way and is the only sane path for a photo taken with a
 * phone.
 *
 * Unlike the receipt, this section is NOT a form: both buttons are plain
 * handlers, because the flow has two server round trips with a network transfer
 * in between and reading that as a single form action buys nothing.
 */

const EMPTY_UPLOAD_STATE: EventImageUploadState = {
  uploadUrl: null,
  publicUrl: null,
  contentType: null,
  error: null,
};

const EMPTY_SAVE_STATE: EventImageState = { ok: false, error: null };

// Shown for a failed transfer: on a phone the cause is almost always the
// network, and the owner needs to know that trying again is the way out. Our
// own validation messages come from the action and are shown as they are.
const UPLOAD_FAILED_MESSAGE =
  "No pudimos subir la foto. Revisá tu conexión y probá de nuevo.";

const PRIMARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-800";

const SECONDARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-md border border-accent-300 bg-white px-5 font-semibold text-accent-700 transition-colors hover:bg-accent-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:border-brand-100 disabled:text-brand-300";

export type EventImageFieldProps = {
  eventId: string;
  theme: string | null;
  imageUrl: string | null;
};

export function EventImageField({
  eventId,
  theme,
  imageUrl,
}: EventImageFieldProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preparedFileRef = useRef<File | null>(null);

  const [prepared, setPrepared] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tone = themeTone(theme);

  // The preview is an object URL; it has to be released when it is replaced,
  // or the browser keeps the whole photo alive for the life of the tab.
  useEffect(() => {
    if (!previewUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /*
   * Shrinks the photo in the browser before the upload.
   *
   * Same approach as the receipt: a 12MP photo straight off a phone is several
   * megabytes over a mobile connection, and the catalog never needs more than
   * EVENT_IMAGE_MAX_DIMENSION on the long edge.
   */
  const compressPhoto = async (file: File): Promise<File> => {
    if (file.size < 1024 * 1024 && file.type === "image/jpeg") {
      return file;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        // A plain element, not the next/image component: this is a local decode
        // of a file the browser already holds, with no URL to optimize.
        const image = document.createElement("img");
        image.onload = () => {
          const canvas = document.createElement("canvas");
          let width = image.width;
          let height = image.height;

          if (
            width > EVENT_IMAGE_MAX_DIMENSION ||
            height > EVENT_IMAGE_MAX_DIMENSION
          ) {
            if (width > height) {
              height = (height * EVENT_IMAGE_MAX_DIMENSION) / width;
              width = EVENT_IMAGE_MAX_DIMENSION;
            } else {
              width = (width * EVENT_IMAGE_MAX_DIMENSION) / height;
              height = EVENT_IMAGE_MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("No se pudo crear el contexto del canvas"));
            return;
          }
          context.drawImage(image, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Error al comprimir la foto"));
                return;
              }
              resolve(
                new File([blob], file.name, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                }),
              );
            },
            "image/jpeg",
            EVENT_IMAGE_JPEG_QUALITY,
          );
        };
        image.onerror = () => reject(new Error("Error al cargar la imagen"));
        image.src = loadEvent.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo"));
      reader.readAsDataURL(file);
    });
  };

  const clearPickedFile = () => {
    preparedFileRef.current = null;
    setPrepared(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = async (changeEvent: ChangeEvent<HTMLInputElement>) => {
    const file = changeEvent.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setNotice(null);

    if (!isAllowedEventImageMimeType(file.type)) {
      setError(`Formato no soportado. Permitidos: ${EVENT_IMAGE_FORMATS_LABEL}.`);
      clearPickedFile();
      return;
    }

    if (file.size > MAX_EVENT_IMAGE_FILE_SIZE) {
      setError("La foto supera los 8MB.");
      clearPickedFile();
      return;
    }

    let ready: File;
    try {
      ready = await compressPhoto(file);
    } catch (compressError) {
      // Some browsers cannot decode every format (HEIC outside Safari). The
      // original already passed the type and size checks, so send it as it is.
      console.error(compressError);
      ready = file;
    }

    preparedFileRef.current = ready;
    setPrepared(ready);
    setPreviewUrl(URL.createObjectURL(ready));
  };

  const handleUpload = async () => {
    const file = preparedFileRef.current;
    if (!file || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const mintForm = new FormData();
    mintForm.set("eventId", eventId);
    mintForm.set("contentType", file.type);
    mintForm.set("fileSize", String(file.size));

    let minted: EventImageUploadState;
    try {
      minted = await requestEventImageUploadAction(EMPTY_UPLOAD_STATE, mintForm);
    } catch (mintError) {
      console.error(mintError);
      setError(UPLOAD_FAILED_MESSAGE);
      setBusy(false);
      return;
    }

    if (!minted.uploadUrl || !minted.publicUrl) {
      setError(minted.error ?? UPLOAD_FAILED_MESSAGE);
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(minted.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": minted.contentType ?? file.type },
      });
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
    } catch (transferError) {
      console.error(transferError);
      setError(UPLOAD_FAILED_MESSAGE);
      setBusy(false);
      return;
    }

    const saveForm = new FormData();
    saveForm.set("eventId", eventId);
    saveForm.set("imageUrl", minted.publicUrl);

    let saved: EventImageState;
    try {
      saved = await setEventImageAction(EMPTY_SAVE_STATE, saveForm);
    } catch (saveError) {
      console.error(saveError);
      setError(UPLOAD_FAILED_MESSAGE);
      setBusy(false);
      return;
    }

    if (!saved.ok) {
      setError(saved.error ?? UPLOAD_FAILED_MESSAGE);
      setBusy(false);
      return;
    }

    clearPickedFile();
    setNotice("Foto guardada.");
    setBusy(false);
    startTransition(() => router.refresh());
  };

  const handleRemove = async () => {
    if (busy) {
      return;
    }

    // A photo that was chosen but never uploaded only lives in the browser.
    if (prepared) {
      clearPickedFile();
      setError(null);
      setNotice(null);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const form = new FormData();
    form.set("eventId", eventId);
    form.set("imageUrl", "");

    try {
      const saved = await setEventImageAction(EMPTY_SAVE_STATE, form);
      if (!saved.ok) {
        setError(saved.error ?? UPLOAD_FAILED_MESSAGE);
        return;
      }
      setNotice("Foto eliminada.");
      startTransition(() => router.refresh());
    } catch (removeError) {
      console.error(removeError);
      setError(UPLOAD_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-brand-100 bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-brand-900">Foto del evento</h2>
        <p className="text-sm text-ink-soft">
          Es la foto que se ve en el catálogo, arriba de la fecha. Se muestra
          recortada en 3:4, así que una foto vertical entra mejor.
        </p>
      </div>

      <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-md">
        {previewUrl ? (
          // The preview is an object URL of a file the browser still holds, so
          // there is nothing for the image optimizer to fetch.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Vista previa de la foto elegida"
            className="h-full w-full object-cover"
          />
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt="Foto actual del evento"
            fill
            sizes="384px"
            className="object-cover"
          />
        ) : (
          <div className={`h-full w-full ${tone.placeholder}`} />
        )}
      </div>

      {prepared ? (
        <p className="text-sm text-ink-soft">
          Elegiste <span className="font-semibold">{prepared.name}</span>.
          Todavía no se guardó: apretá «Guardar foto».
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="event-image-file"
          className="font-semibold text-brand-800"
        >
          Elegir foto
        </label>
        <input
          ref={fileInputRef}
          id="event-image-file"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={busy}
          className="min-h-12 w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-ink outline-none file:mr-3 file:rounded file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:font-semibold file:text-brand-800 focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
        />
        <p className="text-sm text-ink-soft">
          Formatos: {EVENT_IMAGE_FORMATS_LABEL}. Hasta 8MB.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-accent-50 px-3 py-2 text-sm font-medium text-accent-700"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-md bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!prepared || busy}
          className={PRIMARY_BUTTON}
        >
          {busy ? "Subiendo…" : "Guardar foto"}
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={(!imageUrl && !prepared) || busy}
          className={SECONDARY_BUTTON}
        >
          Quitar foto
        </button>
      </div>
    </section>
  );
}
