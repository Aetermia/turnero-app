<?php
/*
 * Public, no-login page reached with the secret token (port of
 * src/app/reservas/[token]/page.tsx). The state shown is the EFFECTIVE one,
 * evaluated by the database in the same query: an abandoned hold reads as
 * "expired" here even though its stored status never changed.
 *
 * @var array<string, mixed> $reservation
 * @var string|null $paymentAlias
 * @var array<string, string> $errors
 * @var array<string, string> $old
 * @var string|null $formError
 * @var string|null $uploadError
 */
$status = $reservation['effective_status'];
$isHeld = $status === 'pending_no_receipt';
$hasReceipt = (bool) $reservation['has_receipt'];
$token = $reservation['public_token'];

$heading = match ($status) {
    'pending_no_receipt' => 'Te guardamos el lugar',
    'pending_review' => 'Tu reserva está en revisión',
    'approved' => 'Tu reserva está confirmada',
    'rejected' => 'No pudimos confirmar tu pago',
    'expired' => 'El plazo venció',
    default => 'La reserva fue cancelada',
};
$inputClass = 'mt-1 block w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-sm text-ink focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600';
$fieldError = static fn (string $field): string => isset($errors[$field])
    ? '<p class="mt-1 text-xs text-red-600">' . e($errors[$field]) . '</p>'
    : '';
?>
<div class="mx-auto w-full max-w-3xl px-4 py-8">
  <header class="flex flex-col gap-2">
    <span class="text-xs font-semibold uppercase tracking-wide text-accent-600">Reserva</span>
    <h1 class="font-display text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl"><?= e($heading) ?></h1>
<?php if ($isHeld): ?>
<?php if ($reservation['expires_at']): ?>
    <p class="text-ink-soft">Tu reserva queda pendiente una vez subido el comprobante de pago. Una vez confirmado, se te avisará por WhatsApp.</p>
<?php endif; ?>
<?php elseif ($status === 'pending_review'): ?>
    <p class="text-ink-soft">Ya recibimos tu comprobante y los datos de la transferencia. Estamos revisando la reserva. Te avisaremos por el canal correspondiente.</p>
<?php elseif ($status === 'approved'): ?>
    <p class="text-ink-soft">Confirmamos tu pago y el lugar queda reservado a tu nombre. ¡Te esperamos!</p>
<?php elseif ($status === 'rejected'): ?>
    <p class="text-ink-soft">Revisamos el comprobante y no pudimos confirmar tu pago.<?= $reservation['rejection_reason'] ? e(' Motivo: ' . $reservation['rejection_reason'] . '.') : '' ?> Si creés que es un error, escribinos por WhatsApp.</p>
<?php elseif ($status === 'expired'): ?>
    <p class="text-ink-soft">El plazo para transferir venció y el lugar se liberó. Si todavía querés venir, podés reservar de nuevo.</p>
<?php else: ?>
    <p class="text-ink-soft">La reserva fue cancelada.</p>
<?php endif; ?>
  </header>

  <dl class="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-brand-100 bg-white p-5 text-sm sm:grid-cols-2">
    <div class="flex flex-col gap-0.5">
      <dt class="font-semibold text-brand-700">Evento</dt>
      <dd class="text-ink"><?= e($reservation['event_title']) ?></dd>
    </div>
    <div class="flex flex-col gap-0.5">
      <dt class="font-semibold text-brand-700">Fecha</dt>
      <dd class="text-ink"><?= e(Format::capitalizeFirst(Format::eventDate($reservation['event_starts_at']))) ?> a las <?= e(Format::eventTime($reservation['event_starts_at'])) ?></dd>
    </div>
    <div class="flex flex-col gap-0.5">
      <dt class="font-semibold text-brand-700">Total a transferir</dt>
      <dd class="font-semibold text-ink"><?= e(Format::price($reservation['event_price'])) ?></dd>
    </div>
  </dl>

<?php if ($isHeld): ?>
  <section class="mt-6 flex flex-col gap-2 rounded-lg border border-brand-100 bg-white p-5">
    <h2 class="font-semibold text-brand-800">Cómo pagar</h2>
    <p class="text-sm text-ink-soft">Transferí el total por Mercado Pago a este alias:</p>
<?php if ($paymentAlias): ?>
    <p class="rounded-md bg-brand-50 px-4 py-3 text-lg font-semibold tracking-wide text-brand-800"><?= e($paymentAlias) ?></p>
<?php else: ?>
    <p class="text-sm text-ink-soft">El alias de pago te lo comparte la organización por WhatsApp.</p>
<?php endif; ?>
  </section>

  <section class="mt-6 flex flex-col gap-4 rounded-lg border border-brand-100 bg-white p-5">
    <h2 class="font-semibold text-brand-800">Completar pago</h2>

    <?php /* Without JavaScript this is a plain multipart form; with it, upload.js compresses the photo, shows progress and offers "Reintentar". */ ?>
    <form method="post" action="/reservas/<?= e($token) ?>/comprobante" enctype="multipart/form-data" class="flex flex-col gap-3" data-receipt-upload data-max-bytes="<?= Receipts::MAX_BYTES ?>">
      <?= Csrf::field() ?>
      <div>
        <label for="receipt" class="block text-sm font-medium text-ink">Comprobante de transferencia (imagen)</label>
        <input id="receipt" name="receipt" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,application/pdf" class="mt-1 block w-full text-sm text-ink" data-file>
        <p class="mt-1 text-xs text-ink-soft">Permitidos: <?= e(Receipts::FORMATS_LABEL) ?>. Máximo 8MB. Las fotos se comprimen automáticamente.</p>
        <p class="mt-2 text-sm text-ink" data-pdf-name hidden></p>
        <img alt="Vista previa" class="mt-2 max-h-48 rounded-md border border-brand-100" data-preview hidden>
      </div>
<?php if ($hasReceipt): ?>
      <p class="rounded-md bg-salvia-50 px-3 py-2 text-sm text-ink" data-uploaded-note>Comprobante cargado. Si te equivocaste de archivo, podés elegir otro.</p>
<?php endif; ?>
      <button type="submit" class="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50" data-upload-button<?= $hasReceipt ? ' hidden' : '' ?>><?= $uploadError ? 'Reintentar' : 'Subir comprobante' ?></button>
      <p role="alert" class="text-sm text-red-600" data-upload-error<?= $uploadError ? '' : ' hidden' ?>><?= e($uploadError ?? '') ?></p>
    </form>

<?php if ($hasReceipt): ?>
    <form method="post" action="/reservas/<?= e($token) ?>/confirmar" class="mt-4 flex flex-col gap-3" data-confirm-form>
      <?= Csrf::field() ?>
      <div>
        <label for="transferHolder" class="block text-sm font-medium text-ink">Titular de la transferencia</label>
        <input id="transferHolder" type="text" name="transferHolder" required maxlength="200" value="<?= e($old['transferHolder'] ?? '') ?>" class="<?= $inputClass ?>">
        <?= $fieldError('transferHolder') ?>
      </div>
      <div>
        <label for="transferAmount" class="block text-sm font-medium text-ink">Monto transferido (ARS)</label>
        <input id="transferAmount" type="text" name="transferAmount" inputmode="decimal" required value="<?= e($old['transferAmount'] ?? $reservation['event_price']) ?>" class="<?= $inputClass ?>">
        <p class="mt-1 text-xs text-ink-soft">Total a pagar: <?= e($reservation['event_price']) ?></p>
        <?= $fieldError('transferAmount') ?>
      </div>
      <div>
        <label for="transferDate" class="block text-sm font-medium text-ink">Fecha de transferencia</label>
        <input id="transferDate" type="date" name="transferDate" required value="<?= e($old['transferDate'] ?? '') ?>" class="<?= $inputClass ?>">
        <?= $fieldError('transferDate') ?>
      </div>
      <div>
        <label for="transferReference" class="block text-sm font-medium text-ink">Número de operación / referencia</label>
        <input id="transferReference" type="text" name="transferReference" required maxlength="100" value="<?= e($old['transferReference'] ?? '') ?>" class="<?= $inputClass ?>">
        <?= $fieldError('transferReference') ?>
      </div>
<?php if ($formError): ?>
      <p class="text-sm text-red-600"><?= e($formError) ?></p>
<?php endif; ?>
      <button type="submit" class="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50" data-confirm-button>Confirmar reserva</button>
    </form>
<?php elseif ($formError): ?>
    <p role="alert" class="text-sm text-red-600"><?= e($formError) ?></p>
<?php endif; ?>
  </section>
<?php endif; ?>

<?php if ($status === 'pending_review'): ?>
  <section class="mt-6 flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-5">
    <h2 class="font-semibold text-brand-800">Datos enviados</h2>
    <dl class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div class="flex flex-col gap-0.5">
        <dt class="font-medium text-brand-700">Titular</dt>
        <dd class="text-ink"><?= e($reservation['transfer_holder'] ?: '-') ?></dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="font-medium text-brand-700">Monto declarado</dt>
        <dd class="text-ink"><?= $reservation['transfer_amount'] ? e(Format::price($reservation['transfer_amount'])) : '-' ?></dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="font-medium text-brand-700">Fecha de transferencia</dt>
        <dd class="text-ink"><?= e($reservation['transfer_date'] ?: '-') ?></dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="font-medium text-brand-700">N° de operación</dt>
        <dd class="text-ink"><?= e($reservation['transfer_reference'] ?: '-') ?></dd>
      </div>
    </dl>
    <p class="text-sm text-ink-soft"><?= $hasReceipt ? 'Comprobante subido. Estamos esperando la revisión del equipo.' : 'Estamos esperando la revisión del equipo.' ?></p>
  </section>
<?php endif; ?>

<?php if ($status === 'expired'): ?>
  <a href="/eventos/<?= e($reservation['event_id']) ?>" class="mt-6 inline-flex min-h-10 w-fit items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Ver el evento y reservar de nuevo</a>
<?php endif; ?>
</div>
<?php if ($isHeld): ?>
<script src="/assets/js/upload.js" defer></script>
<?php endif; ?>
