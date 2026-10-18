<?php
/*
 * One event in the public catalog (port of src/components/event-card.tsx). The
 * whole card is a single link, which keeps the tap target large on phones. The
 * photo spans the card at 3:4; without a photo the same box is filled with the
 * tone of the theme, so the rhythm of the list does not change.
 *
 * @var array<string, mixed> $event
 */
$isFull = $event['seats_available'] === 0;
$tone = ThemeTone::for($event['theme']);
?>
<a href="/eventos/<?= e($event['id']) ?>" class="group flex h-full flex-col overflow-hidden rounded-lg border border-brand-100 shadow-sm <?= $tone['surface'] ?> transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
  <header class="flex flex-col gap-1 px-5 pt-6">
<?php if ($event['theme']): ?>
    <span class="text-xs font-semibold uppercase tracking-wide text-accent-600"><?= e($event['theme']) ?></span>
<?php endif; ?>
    <h2 class="font-display text-3xl font-semibold leading-tight text-brand-900"><?= e($event['title']) ?></h2>
  </header>

  <div class="relative mt-5 aspect-[3/4] w-full <?= $tone['placeholder'] ?>">
<?php if ($event['image_url']): ?>
    <img src="<?= e($event['image_url']) ?>" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover">
<?php endif; ?>
  </div>

  <div class="flex flex-1 flex-col gap-3 px-5 pb-6 pt-5">
    <dl class="flex flex-col gap-1 text-base text-ink-soft">
      <div>
        <dt class="sr-only">Fecha y hora</dt>
        <dd class="font-semibold text-ink"><?= e(Format::capitalizeFirst(Format::eventDate($event['starts_at']))) ?> · <?= e(Format::eventTimeRange($event['starts_at'], $event['ends_at'])) ?></dd>
      </div>
<?php if ($event['location']): ?>
      <div>
        <dt class="sr-only">Lugar</dt>
        <dd><?= e($event['location']) ?></dd>
      </div>
<?php endif; ?>
      <div>
        <dt class="sr-only">Precio</dt>
        <dd class="font-semibold text-brand-700"><?= e(Format::price($event['price'])) ?></dd>
      </div>
    </dl>

    <p class="<?= $isFull ? 'text-sm font-semibold text-accent-700' : 'text-sm font-medium text-brand-600' ?>">
      <?= $isFull ? 'Sin lugares disponibles' : e($event['seats_available'] . ' de ' . $event['capacity'] . ' lugares disponibles') ?>
    </p>

    <span class="<?= $isFull
        ? 'mt-auto inline-flex min-h-12 items-center justify-center rounded-md bg-brand-100 px-5 text-center font-semibold text-brand-700'
        : 'mt-auto inline-flex min-h-12 items-center justify-center rounded-md bg-brand-700 px-5 text-center font-semibold text-white transition-colors group-hover:bg-brand-800' ?>">
      <?= $isFull ? 'Evento completo' : 'Más información y reserva' ?>
    </span>
  </div>
</a>
