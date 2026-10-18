<?php
/*
 * Event detail (port of src/app/eventos/[id]/page.tsx).
 *
 * @var array<string, mixed> $event
 */
$isFull = $event['seats_available'] === 0;
?>
<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
  <?= render_partial('partials/back-link', ['href' => '/', 'label' => 'Volver al inicio']) ?>

  <article class="flex flex-col gap-6">
    <header class="flex flex-col gap-2">
<?php if ($event['theme']): ?>
      <span class="text-xs font-semibold uppercase tracking-wide text-accent-600"><?= e($event['theme']) ?></span>
<?php endif; ?>
      <h1 class="font-display text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl"><?= e($event['title']) ?></h1>
    </header>

<?php if ($event['image_url']): ?>
    <div class="relative aspect-[3/4] w-full overflow-hidden rounded-lg">
      <img src="<?= e($event['image_url']) ?>" alt="" decoding="async" class="absolute inset-0 h-full w-full object-cover">
    </div>
<?php endif; ?>

<?php if ($event['description']): ?>
    <p class="text-ink-soft"><?= e($event['description']) ?></p>
<?php endif; ?>

    <dl class="grid grid-cols-1 gap-4 rounded-lg border border-brand-100 p-5 text-sm sm:grid-cols-2 <?= ThemeTone::for($event['theme'])['surface'] ?>">
      <div class="flex flex-col gap-0.5">
        <dt class="font-semibold text-brand-700">Fecha</dt>
        <dd class="text-ink"><?= e(Format::capitalizeFirst(Format::eventDate($event['starts_at']))) ?></dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="font-semibold text-brand-700">Horario</dt>
        <dd class="text-ink"><?= e(Format::eventTimeRange($event['starts_at'], $event['ends_at'])) ?></dd>
      </div>
<?php if ($event['location']): ?>
      <div class="flex flex-col gap-0.5">
        <dt class="font-semibold text-brand-700">Lugar</dt>
        <dd class="text-ink"><?= e($event['location']) ?></dd>
      </div>
<?php endif; ?>
      <div class="flex flex-col gap-0.5">
        <dt class="font-semibold text-brand-700">Precio</dt>
        <dd class="font-semibold text-ink"><?= e(Format::price($event['price'])) ?></dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="font-semibold text-brand-700">Lugares disponibles</dt>
        <dd class="<?= $isFull ? 'font-semibold text-accent-700' : 'text-ink' ?>"><?= $isFull ? 'Sin lugares disponibles' : e($event['seats_available'] . ' de ' . $event['capacity']) ?></dd>
      </div>
    </dl>

    <div class="flex flex-col gap-2">
<?php if ($isFull): ?>
      <button type="button" disabled class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-800 sm:w-auto sm:px-8">Evento completo</button>
<?php else: ?>
      <a href="/eventos/<?= e($event['id']) ?>/reservar" class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto sm:px-8">Reservar mi lugar</a>
<?php endif; ?>
      <p class="text-sm text-ink-soft"><?= $isFull ? 'Este evento ya no tiene lugares disponibles.' : 'Reserva tu lugar antes de que se agoten.' ?></p>
    </div>
  </article>
</div>
