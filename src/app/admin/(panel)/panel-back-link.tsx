"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Way back to the panel dashboard from any screen inside the panel. It travels
 * with the shared panel layout, so every section and every detail page gets it
 * without each page having to remember its own link.
 *
 * It hides itself on the dashboard: there, going back to the panel would mean
 * staying exactly where you are.
 */
export function PanelBackLink() {
  const pathname = usePathname();

  if (pathname === "/admin") {
    return null;
  }

  return (
    <Link
      href="/admin"
      className="text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      ← Volver al panel
    </Link>
  );
}
