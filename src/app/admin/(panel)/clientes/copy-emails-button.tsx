"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Copies the emails of the client list currently on screen, ready to be pasted
 * into the recipients field of a mail client.
 *
 * It copies exactly the list the owner is looking at, which is the same set the
 * CSV export writes: with the search box empty that is every client, and with a
 * search applied it is the matching ones. Two different rules for the button
 * next to it and the link beside it would be a trap.
 *
 * `type="button"` is load-bearing: this renders inside the filter form, where a
 * button with the default type would submit the form and navigate instead of
 * copying.
 */

type CopyState = "idle" | "copied" | "error";

const BUTTON_CLASS =
  "inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent";

const FEEDBACK_MS = 2000;

export function CopyEmailsButton({ emails }: { emails: string[] }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const usable = emails.filter((email) => email.trim().length > 0);

  function showFeedback(next: CopyState): void {
    setState(next);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
  }

  async function handleCopy(): Promise<void> {
    try {
      // Comma separated: every mail client the owner is likely to paste this
      // into splits recipients on a comma and a space.
      await navigator.clipboard.writeText(usable.join(", "));
      showFeedback("copied");
    } catch {
      showFeedback("error");
    }
  }

  const label =
    state === "copied"
      ? "Mails copiados"
      : state === "error"
        ? "No se pudo copiar"
        : "Copiar mails";

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={usable.length === 0}
      title={
        usable.length === 0
          ? "No hay clientes para copiar"
          : `Copia ${usable.length} ${usable.length === 1 ? "mail" : "mails"}`
      }
      className={BUTTON_CLASS}
    >
      {label}
    </button>
  );
}
