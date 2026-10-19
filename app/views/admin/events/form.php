<?php
/*
 * Event form shared by "Nuevo evento" and "Editar evento" (port of
 * event-form.tsx).
 *
 * @var string $action
 * @var array<string, string> $values
 * @var array<string, string> $errors
 * @var string|null $formError
 * @var string $submitLabel
 */
$inputClass = 'min-h-12 w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600';
$labelClass = 'font-semibold text-brand-800';
$err = static fn (string $f): string => isset($errors[$f]) ? '<p id="' . $f . '-error" class="text-sm font-medium text-accent-700">' . e($errors[$f]) . '</p>' : '';
$aria = static fn (string $f): string => isset($errors[$f]) ? ' aria-invalid="true" aria-describedby="' . $f . '-error"' : '';
$v = static fn (string $f): string => e($values[$f] ?? '');
?>
<form method="post" action="<?= e($action) ?>" class="flex flex-col gap-6" data-busy-form>
  <?= Csrf::field() ?>
<?php if ($formError): ?>
  <p role="alert" class="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"><?= e($formError) ?></p>
<?php endif; ?>

  <div class="flex flex-col gap-1.5">
    <label for="title" class="<?= $labelClass ?>">Título</label>
    <input id="title" name="title" type="text" required maxlength="200" value="<?= $v('title') ?>" class="<?= $inputClass ?>"<?= $aria('title') ?>>
    <?= $err('title') ?>
  </div>
  <div class="flex flex-col gap-1.5">
    <label for="theme" class="<?= $labelClass ?>">Temática (opcional)</label>
    <input id="theme" name="theme" type="text" maxlength="100" value="<?= $v('theme') ?>" class="<?= $inputClass ?>"<?= $aria('theme') ?>>
    <?= $err('theme') ?>
  </div>
  <div class="flex flex-col gap-1.5">
    <label for="description" class="<?= $labelClass ?>">Descripción (opcional)</label>
    <textarea id="description" name="description" rows="4" class="<?= $inputClass ?>"<?= $aria('description') ?>><?= $v('description') ?></textarea>
    <?= $err('description') ?>
  </div>
  <div class="flex flex-col gap-1.5">
    <label for="location" class="<?= $labelClass ?>">Lugar (opcional)</label>
    <input id="location" name="location" type="text" maxlength="200" value="<?= $v('location') ?>" class="<?= $inputClass ?>"<?= $aria('location') ?>>
    <?= $err('location') ?>
  </div>
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    <div class="flex flex-col gap-1.5">
      <label for="startsAt" class="<?= $labelClass ?>">Inicio</label>
      <input id="startsAt" name="startsAt" type="datetime-local" required value="<?= $v('startsAt') ?>" class="<?= $inputClass ?>"<?= $aria('startsAt') ?>>
      <?= $err('startsAt') ?>
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="endsAt" class="<?= $labelClass ?>">Fin</label>
      <input id="endsAt" name="endsAt" type="datetime-local" required value="<?= $v('endsAt') ?>" class="<?= $inputClass ?>"<?= $aria('endsAt') ?>>
      <?= $err('endsAt') ?>
    </div>
  </div>
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    <div class="flex flex-col gap-1.5">
      <label for="capacity" class="<?= $labelClass ?>">Capacidad</label>
      <input id="capacity" name="capacity" type="number" min="1" required inputmode="numeric" value="<?= $v('capacity') ?>" class="<?= $inputClass ?>"<?= $aria('capacity') ?>>
      <?= $err('capacity') ?>
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="price" class="<?= $labelClass ?>">Precio por persona</label>
      <input id="price" name="price" type="text" required inputmode="decimal" value="<?= $v('price') ?>" class="<?= $inputClass ?>"<?= $aria('price') ?>>
      <?= $err('price') ?>
    </div>
  </div>
  <div class="flex items-start gap-3 rounded-lg border border-brand-100 bg-white p-5">
    <input id="isPublished" name="isPublished" type="checkbox"<?= ($values['isPublished'] ?? '') === 'on' ? ' checked' : '' ?> class="mt-1 h-5 w-5 shrink-0 rounded border-brand-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
    <label for="isPublished" class="text-sm text-ink">Publicar el evento en el catálogo público. Si no lo marcás, queda como borrador y solo lo ves vos.</label>
  </div>
  <button type="submit" data-busy-label="Guardando…" class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-200 disabled:text-brand-800 sm:w-auto sm:px-8"><?= e($submitLabel) ?></button>
</form>
<script src="/assets/js/busy-form.js" defer></script>
