/*
 * Minimal dashboard placeholder. Event and reservation management land here in
 * later tasks. The layout gates access; this page renders no session-derived
 * data, so it needs no request-time read of its own.
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

      <p className="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft">
        Las secciones de gestión de eventos y reservas se van a habilitar en
        los próximos pasos.
      </p>
    </section>
  );
}
