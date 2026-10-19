<?php
$cards = [
    ['/admin/eventos', 'Eventos', 'Gestionar eventos', 'Creá, editá, publicá y despublicá los encuentros.'],
    ['/admin/reservas', 'Reservas', 'Gestionar reservas', 'Revisá los comprobantes y aprobá o rechazá los pagos.'],
    ['/admin/clientes', 'Clientes', 'Consultar clientes', 'Mirá tu base de contactos y exportala en CSV.'],
];
?>
<section class="flex flex-col gap-4">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-bold text-brand-900">Panel de administración</h1>
    <p class="text-ink-soft">Desde acá vas a poder gestionar los eventos y las reservas.</p>
  </header>
  <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">
<?php foreach ($cards as [$href, $label, $title, $text]): ?>
    <li>
      <a href="<?= e($href) ?>" class="flex h-full flex-col gap-1 rounded-lg border border-brand-100 bg-white p-5 transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
        <span class="text-xs font-semibold uppercase tracking-wide text-accent-600"><?= e($label) ?></span>
        <span class="font-semibold text-brand-900"><?= e($title) ?></span>
        <span class="text-sm text-ink-soft"><?= e($text) ?></span>
      </a>
    </li>
<?php endforeach; ?>
  </ul>
</section>
