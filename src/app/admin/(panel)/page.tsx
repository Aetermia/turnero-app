import Link from "next/link";

/*
 * Minimal dashboard. The layout gates access; this page renders a link into the
 * event management section added in T8. Reservation management lands here next.
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
      </ul>

      <p className="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft">
        La sección de reservas se va a habilitar en los próximos pasos.
      </p>
    </section>
  );
}
