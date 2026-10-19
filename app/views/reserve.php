<?php
/*
 * Booking form, step 1 (port of src/app/eventos/[id]/reservar/page.tsx and
 * src/components/reservation-form.tsx). No terms checkbox (decision D2).
 *
 * @var array<string, mixed> $event
 * @var array<string, string> $errors
 * @var array<string, string> $old
 * @var string|null $formError
 */
$inputClass = 'min-h-12 w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600';
$radioClass = 'h-5 w-5 border-brand-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
$checkboxClass = 'mt-1 h-5 w-5 shrink-0 rounded border-brand-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
$err = static fn (string $field): string => isset($errors[$field])
    ? '<p id="' . $field . '-error" class="text-sm font-medium text-accent-700">' . e($errors[$field]) . '</p>'
    : '';
$invalid = static fn (string $field): string => isset($errors[$field]) ? ' aria-invalid="true"' : '';
$value = static fn (string $field): string => e($old[$field] ?? '');
$answer = $old['hasHealthCondition'] ?? '';
?>
<div class="mx-auto w-full max-w-3xl px-4 py-8">
  <?= render_partial('partials/back-link', ['href' => '/eventos/' . $event['id'], 'label' => 'Volver al evento']) ?>

  <header class="mt-6 flex flex-col gap-2">
    <p class="text-xs font-semibold uppercase tracking-wide text-accent-600">Paso 1 de 2 · Tus datos</p>
    <h1 class="font-display text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">Completá tus datos</h1>
  </header>

  <section aria-label="Evento elegido" class="mt-6 flex flex-col gap-1 rounded-lg border border-brand-100 p-5 <?= ThemeTone::for($event['theme'])['surface'] ?>">
    <p class="font-display text-xl font-semibold leading-tight text-brand-900"><?= e($event['title']) ?></p>
    <p class="text-sm text-ink-soft"><?= e(Format::capitalizeFirst(Format::eventDate($event['starts_at']))) ?> · <?= e(Format::eventTimeRange($event['starts_at'], $event['ends_at'])) ?></p>
    <p class="text-sm font-semibold text-brand-700"><?= e(Format::price($event['price'])) ?></p>
  </section>

  <form method="post" action="/eventos/<?= e($event['id']) ?>/reservar" class="mt-8 flex flex-col gap-6" data-reservation-form novalidate>
    <?= Csrf::field() ?>

<?php if ($formError): ?>
    <p role="alert" class="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"><?= e($formError) ?></p>
<?php endif; ?>

    <div class="flex flex-col gap-1.5">
      <label for="fullName" class="font-semibold text-brand-800">Nombre y apellido</label>
      <input id="fullName" name="fullName" type="text" required maxlength="200" autocomplete="name" value="<?= $value('fullName') ?>" class="<?= $inputClass ?>"<?= $invalid('fullName') ?><?= isset($errors['fullName']) ? ' aria-describedby="fullName-error"' : '' ?>>
      <?= $err('fullName') ?>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="email" class="font-semibold text-brand-800">Email</label>
      <input id="email" name="email" type="email" inputmode="email" required maxlength="320" autocomplete="email" value="<?= $value('email') ?>" class="<?= $inputClass ?>"<?= $invalid('email') ?><?= isset($errors['email']) ? ' aria-describedby="email-error"' : '' ?>>
      <?= $err('email') ?>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="whatsapp" class="font-semibold text-brand-800">Número de teléfono</label>
      <p id="whatsapp-hint" class="text-sm text-ink-soft">Te escribimos por WhatsApp a este número para confirmar tu lugar.</p>
      <input id="whatsapp" name="whatsapp" type="tel" inputmode="tel" required maxlength="32" autocomplete="tel" placeholder="Ej: 2494 15 123456" value="<?= $value('whatsapp') ?>" class="<?= $inputClass ?>"<?= $invalid('whatsapp') ?> aria-describedby="whatsapp-hint<?= isset($errors['whatsapp']) ? ' whatsapp-error' : '' ?>">
      <?= $err('whatsapp') ?>
    </div>

    <fieldset class="flex flex-col gap-2" aria-describedby="hasHealthCondition-hint">
      <legend class="font-semibold text-brand-800">¿Tenés alguna condición de salud que debamos tener en cuenta?</legend>
      <p id="hasHealthCondition-hint" class="text-sm text-ink-soft">Por ejemplo: celiaquía, diabetes, alergias o movilidad reducida.</p>
      <label class="flex items-center gap-2 text-ink">
        <input type="radio" name="hasHealthCondition" value="yes" required<?= $answer === 'yes' ? ' checked' : '' ?> class="<?= $radioClass ?>">
        Sí
      </label>
      <label class="flex items-center gap-2 text-ink">
        <input type="radio" name="hasHealthCondition" value="no" required<?= $answer === 'no' ? ' checked' : '' ?> class="<?= $radioClass ?>">
        No
      </label>
      <?= $err('hasHealthCondition') ?>

      <div class="mt-2 flex flex-col gap-1.5" data-condition-box<?= $answer === 'yes' ? '' : ' hidden' ?>>
        <label for="healthCondition" class="font-semibold text-brand-800">Contanos cuál</label>
        <textarea id="healthCondition" name="healthCondition" rows="3" class="<?= $inputClass ?>"<?= $invalid('healthCondition') ?> aria-describedby="<?= isset($errors['healthCondition']) ? 'healthCondition-error ' : '' ?>healthCondition-note"><?= $value('healthCondition') ?></textarea>
        <?= $err('healthCondition') ?>
        <p id="healthCondition-note" class="text-sm text-ink-soft">Este dato es sensible. Lo usamos solo para cuidarte durante el evento; nunca con fines de marketing ni lo compartimos con terceros.</p>
      </div>
    </fieldset>

    <div class="flex flex-col gap-4 rounded-lg border border-brand-100 bg-white p-5">
      <div class="flex items-start gap-3">
        <input id="marketingConsent" name="marketingConsent" type="checkbox"<?= ($old['marketingConsent'] ?? '') === 'on' ? ' checked' : '' ?> class="<?= $checkboxClass ?>">
        <label for="marketingConsent" class="text-sm text-ink">Quiero recibir novedades y próximos eventos por email (opcional).</label>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <button type="submit" data-submit class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-800 sm:w-auto sm:px-8">Continuar al pago</button>
      <p class="text-sm text-ink-soft">En el siguiente paso vas a ver el alias para transferir y subir el comprobante.</p>
    </div>
  </form>
</div>
<script src="/assets/js/reservation-form.js" defer></script>
