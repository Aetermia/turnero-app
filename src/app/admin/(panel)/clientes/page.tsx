import Link from "next/link";
import { listClientsForAdmin } from "@/lib/clients";
import { formatDateTime } from "@/lib/format";
import { parseAdminClientFilters } from "@/lib/reservation-admin-schema";

/*
 * Client list for the panel: contact data plus what each person reserved,
 * newest activity first, searchable from the query string. The panel layout
 * already requires a session, so the data is read directly.
 *
 * Health data is never rendered here (Ley 25.326): it belongs to the
 * reservation detail page, same rule as the reservations list.
 *
 * Reading `searchParams` makes the route dynamic, so it opts into a blocking
 * route like the login page.
 */

export const instant = false;

const inputClass =
  "min-h-10 w-full rounded-md border border-brand-200 bg-white px-3 text-sm text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600";

function pluralize(value: number, single: string, plural: string): string {
  return value === 1 ? single : plural;
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[] }>;
}) {
  const filters = parseAdminClientFilters(await searchParams);

  const clients = await listClientsForAdmin(filters);

  const hasSearch = Boolean(filters.search);
  // The export must respect the exact filter the list is showing.
  const exportHref = filters.search
    ? `/admin/clientes/export?search=${encodeURIComponent(filters.search)}`
    : "/admin/clientes/export";

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
          Clientes
        </span>
        <h1 className="text-2xl font-bold text-brand-900">Clientes</h1>
        <p className="text-ink-soft">
          Tu base de contactos: mirá qué reservó cada persona y exportala en
          CSV.
        </p>
      </header>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label
            htmlFor="search"
            className="text-sm font-semibold text-brand-800"
          >
            Nombre, email o WhatsApp
          </label>
          <input
            id="search"
            name="search"
            type="search"
            defaultValue={filters.search ?? ""}
            placeholder="Ej.: María, maria@… o +54 9 11…"
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Filtrar
          </button>
          {hasSearch ? (
            <Link
              href="/admin/clientes"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              Limpiar
            </Link>
          ) : null}
          <Link
            href={exportHref}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Exportar CSV
          </Link>
        </div>
      </form>

      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft">
          {hasSearch
            ? "No hay clientes que coincidan con la búsqueda."
            : "Todavía no hay clientes."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {clients.map((client) => (
            <li
              key={client.id}
              className="flex flex-col gap-1 rounded-lg border border-brand-100 bg-white p-4"
            >
              <span className="font-semibold text-brand-900">
                {client.fullName}
              </span>
              <span className="text-sm text-ink-soft">
                {client.email} · {client.whatsapp}
              </span>
              <span className="text-sm text-ink-soft">
                {client.totalReservations}{" "}
                {pluralize(client.totalReservations, "reserva", "reservas")} ·{" "}
                {client.activeReservations}{" "}
                {pluralize(client.activeReservations, "activa", "activas")}
              </span>
              <span className="text-xs text-ink-soft">
                {client.lastReservationAt
                  ? `Última reserva · ${formatDateTime(client.lastReservationAt)}`
                  : "Sin reservas"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}