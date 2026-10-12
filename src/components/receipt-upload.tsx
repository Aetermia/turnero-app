"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { completeReservationAction, getSignedUploadUrl } from "@/app/reservas/[token]/actions";
import type { UploadUrlFormState, CompleteReservationFormState } from "@/app/reservas/[token]/actions";
import { isAllowedReceiptMimeType, MAX_RECEIPT_FILE_SIZE } from "@/lib/receipt";

export type ReceiptUploadProps = {
  token: string;
  eventPrice: string;
};

type UploadState = {
  file: File | null;
  previewUrl: string | null;
  uploading: boolean;
  uploaded: boolean;
  receiptPath: string | null;
  receiptMimeType: string | null;
  error: string | null;
};

export function ReceiptUpload({ token, eventPrice }: ReceiptUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    previewUrl: null,
    uploading: false,
    uploaded: false,
    receiptPath: null,
    receiptMimeType: null,
    error: null,
  });

  const [uploadUrlState, uploadUrlAction, uploadUrlPending] = useActionState<
    UploadUrlFormState,
    FormData
  >(getSignedUploadUrl, {
    fieldErrors: {},
    formError: null,
    success: false,
    data: null,
  });

  const [completeState, completeAction, completePending] = useActionState<
    CompleteReservationFormState,
    FormData
  >(completeReservationAction, {
    fieldErrors: {},
    formError: null,
    success: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compressedFileRef = useRef<File | null>(null);

  useEffect(() => {
    if (uploadUrlState.success && uploadUrlState.data && compressedFileRef.current) {
      const data = uploadUrlState.data;
      const performUpload = async () => {
        setUploadState((prev) => ({ ...prev, uploading: true, error: null }));
        try {
          const response = await fetch(data.uploadUrl, {
            method: "PUT",
            body: compressedFileRef.current,
            headers: {
              "Content-Type": data.contentType,
            },
          });

          if (!response.ok) {
            throw new Error(`Error al subir archivo: ${response.statusText}`);
          }

          setUploadState((prev) => ({
            ...prev,
            uploading: false,
            uploaded: true,
            receiptPath: data.path,
            receiptMimeType: data.contentType,
          }));
        } catch (error) {
          setUploadState((prev) => ({
            ...prev,
            uploading: false,
            error: error instanceof Error ? error.message : "Error al subir archivo",
          }));
        }
      };
      performUpload();
    }
  }, [uploadUrlState]);

  const compressImage = async (file: File): Promise<File> => {
    // If already small and JPEG, return as-is
    if (file.size < 1024 * 1024 && file.type === "image/jpeg") {
      return file;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const maxDimension = 1600;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height * maxDimension) / width;
              width = maxDimension;
            } else {
              width = (width * maxDimension) / height;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("No se pudo crear el contexto del canvas"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Error al comprimir imagen"));
                return;
              }
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            "image/jpeg",
            0.8,
          );
        };
        img.onerror = () => reject(new Error("Error al cargar imagen"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Error al leer archivo"));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAllowedReceiptMimeType(file.type)) {
      setUploadState((prev) => ({
        ...prev,
        error: "Formato no soportado. Permitidos: JPG, PNG, WEBP, HEIC",
      }));
      return;
    }

    if (file.size > MAX_RECEIPT_FILE_SIZE) {
      setUploadState((prev) => ({
        ...prev,
        error: "El archivo supera los 8MB",
      }));
      return;
    }

    setUploadState((prev) => ({ ...prev, error: null }));

    try {
      const compressed = await compressImage(file);
      compressedFileRef.current = compressed;

      const previewUrl = URL.createObjectURL(compressed);
      setUploadState((prev) => ({
        ...prev,
        file: compressed,
        previewUrl,
      }));
    } catch (error) {
      setUploadState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Error al procesar imagen",
      }));
    }
  };

  const handleGetUploadUrl = (formData: FormData) => {
    if (!compressedFileRef.current) {
      setUploadState((prev) => ({ ...prev, error: "No hay archivo seleccionado" }));
      return;
    }
    formData.set("token", token);
    formData.set("contentType", uploadState.receiptMimeType || compressedFileRef.current.type || "image/jpeg");
    formData.set("fileSize", String(compressedFileRef.current.size));
    formData.set("fileName", compressedFileRef.current.name);
    uploadUrlAction(formData);
  };

  return (
    <section className="mt-6 flex flex-col gap-4 rounded-lg border border-brand-100 bg-white p-5">
      <h2 className="font-semibold text-brand-800">Completar pago</h2>
      
      <form action={handleGetUploadUrl} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="block text-sm font-medium text-ink">
            Comprobante de transferencia (imagen)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleFileChange}
            className="mt-1 block w-full text-sm text-ink"
            disabled={uploadState.uploaded || uploadUrlPending || uploadState.uploading}
          />
          <p className="mt-1 text-xs text-ink-soft">
            Permitidos: JPG, PNG, WEBP, HEIC. Máximo 8MB (se comprimirá automáticamente)
          </p>
          {uploadState.previewUrl && (
            <div className="mt-2">
              <img
                src={uploadState.previewUrl}
                alt="Vista previa"
                className="max-h-48 rounded-md border border-brand-100"
              />
            </div>
          )}
        </div>

        {compressedFileRef.current && !uploadState.uploaded && (
          <button
            type="submit"
            disabled={uploadUrlPending || uploadState.uploading}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {uploadUrlPending || uploadState.uploading ? "Subiendo..." : "Subir comprobante"}
          </button>
        )}

        {(uploadState.error || uploadUrlState.formError) && (
          <p className="text-sm text-red-600">
            {uploadState.error || uploadUrlState.formError}
          </p>
        )}
      </form>

      {uploadState.uploaded && (
        <form action={completeAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="receiptPath" value={uploadState.receiptPath || ""} />
          <input type="hidden" name="receiptMimeType" value={uploadState.receiptMimeType || ""} />

          <div>
            <label className="block text-sm font-medium text-ink">
              Titular de la transferencia
            </label>
            <input
              type="text"
              name="transferHolder"
              required
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
            {completeState.fieldErrors.transferHolder && (
              <p className="mt-1 text-xs text-red-600">
                {completeState.fieldErrors.transferHolder}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              Monto transferido (ARS)
            </label>
            <input
              type="text"
              name="transferAmount"
              defaultValue={eventPrice}
              required
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-ink-soft">
              Total a pagar: {eventPrice}
            </p>
            {completeState.fieldErrors.transferAmount && (
              <p className="mt-1 text-xs text-red-600">
                {completeState.fieldErrors.transferAmount}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              Fecha de transferencia
            </label>
            <input
              type="date"
              name="transferDate"
              required
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
            {completeState.fieldErrors.transferDate && (
              <p className="mt-1 text-xs text-red-600">
                {completeState.fieldErrors.transferDate}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              Número de operación / referencia
            </label>
            <input
              type="text"
              name="transferReference"
              required
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
            {completeState.fieldErrors.transferReference && (
              <p className="mt-1 text-xs text-red-600">
                {completeState.fieldErrors.transferReference}
              </p>
            )}
          </div>

          {completeState.formError && (
            <p className="text-sm text-red-600">{completeState.formError}</p>
          )}

          <button
            type="submit"
            disabled={completePending}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {completePending ? "Confirmando..." : "Confirmar reserva"}
          </button>
        </form>
      )}
    </section>
  );
}
