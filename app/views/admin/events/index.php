<?php /** @var list<array<string, mixed>> $events @var string|null $notice */ ?>
<section class="flex flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div class="flex flex-col gap-1">
      <span class="text-xs font-semibold uppercase tracking-wide text-accent-600">Eventos</span>
      <h1 class="text-2xl font-bold text-brand-900">Eventos</h1>
      <p class="text-ink-soft">Creá, editá y publicá los encuentros del local.</p>
    </div>
    <a href="/admin/eventos/nuevo" class="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Nuevo evento</a>
  </header>

<?php if ($events === []): ?>
  <p class="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft">Todavía no hay eventos cargados. Creá el primero con el botón «Nuevo evento».</p>
<?php else: ?>
  <ul class="flex flex-col gap-3">
<?php foreach ($events as $event): ?>
    <li class="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-brand-900"><?= e($event['title']) ?></span>
          <span class="<?= $event['is_published'] ? 'rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700' : 'rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-700' ?>"><?= $event['is_published'] ? 'Publicado' : 'Borrador' ?></span>
        </div>
<?php if ($event['theme']): ?>
        <span class="text-xs font-semibold uppercase tracking-wide text-accent-600"><?= e($event['theme']) ?></span>
<?php endif; ?>
        <span class="text-sm text-ink-soft"><?= e(Format::capitalizeFirst(Format::eventDate($event['starts_at']))) ?> · <?= e(Format::eventTimeRange($event['starts_at'], $event['ends_at'])) ?></span>
        <span class="text-sm text-ink-soft"><?= e($event['occupied'] . ' de ' . $event['capacity'] . ' lugares ocupados · ' . Format::price($event['price'])) ?></span>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <a href="/admin/eventos/<?= e($event['id']) ?>" class="inline-flex min-h-9 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Editar</a>
        <form method="post" action="/admin/eventos/<?= e($event['id']) ?>/publicar">
          <?= Csrf::field() ?>
          <input type="hidden" name="publish" value="<?= $event['is_published'] ? 'false' : 'true' ?>">
          <button type="submit" class="inline-flex min-h-9 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><?= $event['is_published'] ? 'Despublicar' : 'Publicar' ?></button>
        </form>
      </div>
    </li>
<?php endforeach; ?>
  </ul>
<?php endif; ?>
</section>
