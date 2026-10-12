import type { ReactNode } from "react";
import { connection } from "next/server";
import { logoutAdmin } from "@/app/admin/actions/logout";
import { getAdminSession } from "@/lib/auth";

/*
 * Defense-in-depth check for the whole panel. `/admin/login` lives outside this
 * route group, so it is never wrapped by this check and the unauthenticated
 * request cannot loop back to itself. URL is still `/admin`, not
 * `/admin/(panel)`.
 *
 * Proxy is the authoritative gate and answers an invalid session with an HTTP
 * 307 before this renders. This layout only covers the narrow race where the
 * cookie expires between the edge check and the render: it returns nothing
 * instead of throwing `redirect()`, because a redirect raised after the PPR
 * shell has flushed cannot change the status and would leak panel content.
 *
 * `connection()` makes rendering wait for the incoming request, so the check
 * runs against a real request instead of the prerender pass, where `Date.now()`
 * is unstable.
 */
export const instant = false;
export default async function AdminPanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  const session = await getAdminSession();
  if (!session) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white px-4 py-3">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
            Administración
          </span>
          <span className="text-sm text-ink-soft">
            Sesión de {session.username}
          </span>
        </div>

        <form action={logoutAdmin}>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Cerrar sesión
          </button>
        </form>
      </div>

      {children}
    </div>
  );
}
