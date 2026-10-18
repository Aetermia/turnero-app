<?php
/**
 * @var array<string, mixed> $reservation
 * @var string|null $notice
 * @var array<string, string> $errors
 * @var string|null $formError
 * @var string $reasonValue
 */
$card = 'flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-5';
$item = static fn (string $label, string $value): string =>
    '<div class="flex flex-col gap-0.5"><dt class="font-semibold text-brand-700">' . e($label) . '</dt><dd class="text-ink">' . e($value) . '</dd></div>';
$r = $reservation;
$isPdf = Receipts::isPdf($r['receipt_mime_type']);
$receiptUrl = '/admin/reservas/' . $r['id'] . '/comprobante';
$canResolve = $r['status'] === 'pending_review';
$reasonError = $errors['rejectionReason'] ?? null;

$timeline = 'Reserva creada el ' . Format::dateTime($r['created_at']) . '.';
if ($r['resolved_at'] !== null) {
    $timeline .= ' Resuelta el ' . Format::dateTime($r['resolved_at']) . '.';
} elseif ($r['effective_status'] === 'expired') {
    $timeline .= ' El plazo de retención venció' . ($r['expires_at'] !== null ? ' el ' . Format::dateTime($r['expires_at']) : '') . ' y el lugar se liberó.';
} elseif ($r['expires_at'] !== null) {
    $timeline .= ' Retiene el lugar hasta el ' . Format::dateTime($r['expires_at']) . '.';
}
?>
<section class="flex flex-col gap-6">
  <div class="flex flex-col gap-2">
    <a href="/admin/reservas" class="text-sm font-semibold text-brand-700 hover:underline">← Volver a reservas</a>
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-2xl font-bold text-brand-900"><?= e($r['customer_full_name']) ?></h1>
      <?= render_partial('admin/reservations/status-badge', ['status' => $r['effective_status']]) ?>
    </div>
    <p class="text-sm text-ink-soft"><?= e($timeline) ?></p>
  </div>

<?php if ($notice !== null): ?>
  <p role="alert" class="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"><?= e($notice) ?></p>
<?php endif; ?>

  <section class="<?= $card ?>">
    <h2 class="font-semibold text-brand-800">Datos del cliente</h2>
    <dl class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <?= $item('Nombre', $r['customer_full_name']) ?>
      <?= $item('Email', $r['customer_email']) ?>
      <?= $item('WhatsApp', $r['customer_whatsapp']) ?>
      <?= $item('Consentimiento de marketing', $r['customer_marketing_consent']
          ? 'Sí' . ($r['customer_marketing_consent_at'] !== null ? ', autorizó el ' . Format::dateTime($r['customer_marketing_consent_at']) : '')
          : 'No autorizó') ?>
    </dl>
  </section>

  <section class="<?= $card ?>">
    <h2 class="font-semibold text-brand-800">Evento</h2>
    <dl class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <?= $item('Título', $r['event_title']) ?>
      <?= $item('Temática', (string) ($r['event_theme'] ?: '-')) ?>
      <?= $item('Lugar', (string) ($r['event_location'] ?: '-')) ?>
      <?= $item('Fecha', Format::capitalizeFirst(Format::eventDate($r['event_starts_at'])) . ' · ' . Format::eventTimeRange($r['event_starts_at'], $r['event_ends_at'])) ?>
      <?= $item('Precio por persona', Format::price($r['event_price'])) ?>
      <?= $item('Capacidad', $r['event_capacity'] . ' personas') ?>
    </dl>
  </section>

  <section class="<?= $card ?>">
    <h2 class="font-semibold text-brand-800">Datos declarados de la transferencia</h2>
    <dl class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <?= $item('Titular', (string) ($r['transfer_holder'] ?: '-')) ?>
      <?= $item('Monto declarado', $r['transfer_amount'] !== null ? Format::price($r['transfer_amount']) : '-') ?>
      <?= $item('Fecha de la transferencia', $r['transfer_date'] !== null ? Format::isoDate($r['transfer_date']) : '-') ?>
      <?= $item('N° de operación', (string) ($r['transfer_reference'] ?: '-')) ?>
    </dl>
    <p class="text-xs text-ink-soft">Son datos declarados por la persona. Conviene cruzarlos con el comprobante y con tu app bancaria.</p>
  </section>

  <section class="<?= $card ?>">
    <h2 class="font-semibold text-brand-800">Condición de salud</h2>
<?php if ($r['has_condition']): ?>
    <p class="text-sm text-ink-soft">Declaró una condición:</p>
    <p class="rounded-md bg-accent-50 px-4 py-3 text-ink"><?= e((string) ($r['condition_details'] ?: 'Sin detalle')) ?></p>
<?php else: ?>
    <p class="text-sm text-ink-soft">No declaró condiciones de salud.</p>
<?php endif; ?>
    <p class="text-xs text-ink-soft">Dato sensible (Ley 25.326): se usa solo para organizar el encuentro, no se comparte con terceros ni se usa para marketing.</p>
  </section>

  <section class="<?= $card ?>">
    <h2 class="font-semibold text-brand-800">Comprobante</h2>
<?php if ($r['receipt_path'] === null): ?>
    <p class="text-sm text-ink-soft">Todavía no hay comprobante cargado para esta reserva.</p>
<?php else: ?>
    <div class="flex flex-col gap-3">
      <a href="<?= e($receiptUrl) ?>" target="_blank" rel="noreferrer" class="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><?= $isPdf ? 'Abrir el PDF en una pestaña nueva' : 'Abrir en una pestaña nueva' ?></a>
<?php if ($isPdf): ?>
      <p class="text-sm text-ink-soft">El comprobante es un PDF: abrilo con el botón de arriba.</p>
<?php else: ?>
      <img src="<?= e($receiptUrl) ?>" alt="Comprobante de la transferencia" class="max-h-[32rem] w-full rounded-md border border-brand-100 object-contain">
<?php endif; ?>
<?php if ($r['receipt_uploaded_at'] !== null): ?>
      <p class="text-xs text-ink-soft">Subido el <?= e(Format::dateTime($r['receipt_uploaded_at'])) ?>.</p>
<?php endif; ?>
    </div>
<?php endif; ?>
  </section>

  <section class="<?= $card ?>">
    <h2 class="font-semibold text-brand-800">Resolución</h2>
<?php if ($canResolve): ?>
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div class="flex flex-col gap-3">
        <h3 class="font-semibold text-brand-800">Aprobar</h3>
        <p class="text-sm text-ink-soft">Confirma que el pago llegó. El lugar sigue ocupado, igual que antes de aprobar.</p>
        <form method="post" action="/admin/reservas/<?= e($r['id']) ?>/aprobar" data-busy-form>
          <?= Csrf::field() ?>
          <button type="submit" data-busy-label="Aprobando…" class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8">Aprobar reserva</button>
        </form>
      </div>
      <div class="flex flex-col gap-3">
        <h3 class="font-semibold text-brand-800">Rechazar</h3>
        <p class="text-sm text-ink-soft">Libera el lugar automáticamente. El motivo queda registrado en la reserva.</p>
        <form method="post" action="/admin/reservas/<?= e($r['id']) ?>/rechazar" class="flex flex-col gap-3" data-busy-form>
          <?= Csrf::field() ?>
          <div class="flex flex-col gap-1.5">
            <label for="rejectionReason" class="font-semibold text-brand-800">Motivo del rechazo (opcional)</label>
            <textarea id="rejectionReason" name="rejectionReason" rows="3" maxlength="500" placeholder="Por ejemplo: el monto transferido no coincide con el total." class="min-h-12 w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"<?= $reasonError ? ' aria-invalid="true" aria-describedby="rejectionReason-error"' : '' ?>><?= e($reasonValue) ?></textarea>
<?php if ($reasonError): ?>
            <p id="rejectionReason-error" class="text-sm font-medium text-accent-700"><?= e($reasonError) ?></p>
<?php endif; ?>
          </div>
<?php if ($formError !== null): ?>
          <p role="alert" class="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"><?= e($formError) ?></p>
<?php endif; ?>
          <button type="submit" data-busy-label="Rechazando…" class="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-accent-300 bg-white px-5 font-semibold text-accent-700 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8">Rechazar reserva</button>
        </form>
      </div>
    </div>
<?php else: ?>
    <div class="flex flex-col gap-1 text-sm">
<?php if ($formError !== null): ?>
      <p role="alert" class="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"><?= e($formError) ?></p>
<?php endif; ?>
      <p class="text-ink">Estado actual: <?= e(Format::reservationStatus($r['effective_status'])) ?>.</p>
      <p class="text-ink-soft">Solo las reservas en revisión se pueden aprobar o rechazar.</p>
<?php if ($r['status'] === 'rejected' && $r['rejection_reason'] !== null && $r['rejection_reason'] !== ''): ?>
      <p class="text-ink-soft">Motivo del rechazo: <?= e($r['rejection_reason']) ?></p>
<?php endif; ?>
    </div>
<?php endif; ?>
  </section>
</section>
<script src="/assets/js/busy-form.js" defer></script>
