<section class="flex flex-col gap-6">
  <div class="flex flex-col gap-2">
    <a href="/admin/eventos" class="text-sm font-semibold text-brand-700 hover:underline">← Volver a eventos</a>
    <h1 class="text-2xl font-bold text-brand-900">Nuevo evento</h1>
    <p class="text-ink-soft">Completá los datos y decidí si querés publicarlo en el catálogo.</p>
  </div>
  <?= render_partial('admin/events/form', get_defined_vars()) ?>
</section>
