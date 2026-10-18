<?php
/**
 * @var array{eventId: string|null, status: string|null} $filters
 * @var list<array<string, mixed>> $reservations
 * @var list<array<string, mixed>> $events
 */
$selectClass = 'min-h-10 w-full rounded-md border border-brand-200 bg-white px-3 text-sm text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600';
$hasFilters = $filters['eventId'] !== null || $filters['status'] !== null;
?>
<section class="flex flex-col gap-6">
  <header class="flex flex-col gap-1">
    <span class="text-xs font-semibold uppercase tracking-wide text-accent-600">Reservas</span>
    <h1 class="text-2xl font-bold text-brand-900">Reservas</h1>
    <p class="text-ink-soft">Aprobar confirma el pago y mantiene el lugar ocupado; rechazar lo libera solo.</p>
  </header>

  <form method="get" class="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-end">
    <div class="flex flex-1 flex-col gap-1.5">
      <label for="eventId" class="text-sm font-semibold text-brand-800">Evento</label>
      <select id="eventId" name="eventId" class="<?= $selectClass ?>">
        <option value="">Todos los eventos</option>
<?php foreach ($events as $event): ?>
        <option value="<?= e($event['id']) ?>"<?= $filters['eventId'] === $event['id'] ? ' selected' : '' ?>><?= e($event['title']) ?></option>
<?php endforeach; ?>
      </select>
    </div>
    <div class="flex flex-1 flex-col gap-1.5">
      <label for="status" class="text-sm font-semibold text-brand-800">Estado</label>
      <select id="status" name="status" class="<?= $selectClass ?>">
        <option value="">Todos los estados</option>
<?php foreach (ReservationsAdmin::STATUSES as $status): ?>
        <option value="<?= e($status) ?>"<?= $filters['status'] === $status ? ' selected' : '' ?>><?= e(Format::reservationStatus($status)) ?></option>
<?php endforeach; ?>
      </select>
    </div>
    <div class="flex items-center gap-2">
      <button type="submit" class="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Filtrar</button>
<?php if ($hasFilters): ?>
      <a href="/admin/reservas" class="inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Limpiar</a>
<?php endif; ?>
    </div>
  </form>

<?php if ($reservations === []): ?>
  <p class="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft"><?= $hasFilters ? 'No hay reservas que coincidan con el filtro.' : 'Todavía no hay reservas cargadas.' ?></p>
<?php else: ?>
  <ul class="flex flex-col gap-3">
<?php foreach ($reservations as $reservation): ?>
    <li class="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-brand-900"><?= e($reservation['customer_full_name']) ?></span>
          <?= render_partial('admin/reservations/status-badge', ['status' => $reservation['effective_status']]) ?>
        </div>
        <span class="text-sm text-ink-soft"><?= e($reservation['event_title']) ?> · <?= e(Format::eventDate($reservation['event_starts_at']) . ' ' . Format::eventTime($reservation['event_starts_at'])) ?></span>
        <span class="text-sm text-ink-soft"><?= e($reservation['customer_email']) ?> · <?= e($reservation['customer_whatsapp']) ?></span>
        <span class="text-xs text-ink-soft">Reservada el <?= e(Format::dateTime($reservation['created_at'])) ?> · <?= $reservation['has_receipt'] ? 'con comprobante' : 'sin comprobante' ?></span>
      </div>
      <a href="/admin/reservas/<?= e($reservation['id']) ?>" class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Ver detalle</a>
    </li>
<?php endforeach; ?>
  </ul>
<?php endif; ?>
</section>
