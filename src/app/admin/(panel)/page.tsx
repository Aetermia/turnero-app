import Link from "next/link";

/*
 * Minimal dashboard. The layout gates access; this page renders the links into
 * the event management (T8), reservation management (T9) and client list/export
 * (T12) sections.
 */
export default function AdminDashboardPage() {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-brand-900">
          Panel de administración
        </h1>
        <p className="text-ink-soft">
          Desde acá vas a poder gestionar los eventos y las reservas.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/admin/eventos"
            className="flex h-full flex-col gap-1 rounded-lg border border-brand-100 bg-white p-5 transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
              Eventos
            </span>
            <span className="font-semibold text-brand-900">
              Gestionar eventos
            </span>
            <span className="text-sm text-ink-soft">
              Creá, editá, publicá y despublicá los encuentros.
            </span>
          </Link>
        </li>

        <li>
          <Link
            href="/admin/reservas"
            className="flex h-full flex-col gap-1 rounded-lg border border-brand-100 bg-white p-5 transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
              Reservas
            </span>
            <span className="font-semibold text-brand-900">
              Gestionar reservas
            </span>
            <span className="text-sm text-ink-soft">
              Revisá los comprobantes y aprobá o rechazá los pagos.
            </span>
          </Link>
        </li>

        <li>
          <Link
            href="/admin/clientes"
            className="flex h-full flex-col gap-1 rounded-lg border border-brand-100 bg-white p-5 transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
              Clientes
            </span>
            <span className="font-semibold text-brand-900">
              Consultar clientes
            </span>
            <span className="text-sm text-ink-soft">
              Mirá tu base de contactos y exportala en CSV.
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
