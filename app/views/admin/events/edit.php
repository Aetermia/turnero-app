<?php
/**
 * @var array<string, mixed> $event
 * @var string|null $photoNotice
 * @var string|null $photoError
 */
$tone = ThemeTone::for($event['theme']);
?>
<section class="flex flex-col gap-6">
  <div class="flex flex-col gap-2">
    <a href="/admin/eventos" class="text-sm font-semibold text-brand-700 hover:underline">← Volver a eventos</a>
    <h1 class="text-2xl font-bold text-brand-900">Editar evento</h1>
    <p class="text-sm text-ink-soft"><?= e($event['occupied'] . ' de ' . $event['capacity']) ?> lugares ocupados. No podés bajar la capacidad por debajo de los lugares ya ocupados.</p>
  </div>

  <?= render_partial('admin/events/form', get_defined_vars()) ?>

  <?php /* Event photo (port of event-image-field.tsx). */ ?>
  <section class="flex flex-col gap-4 rounded-lg border border-brand-100 bg-white p-5" data-event-photo data-max-bytes="<?= EventImages::MAX_BYTES ?>">
    <div class="flex flex-col gap-1">
      <h2 class="text-lg font-semibold text-brand-900">Foto del evento</h2>
      <p class="text-sm text-ink-soft">Es la foto que se ve en el catálogo, arriba de la fecha. Se muestra recortada en 3:4, así que una foto vertical entra mejor.</p>
    </div>

    <div class="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-md <?= $tone['placeholder'] ?>">
<?php if ($event['image_url']): ?>
      <img src="<?= e($event['image_url']) ?>" alt="Foto actual del evento" class="absolute inset-0 h-full w-full object-cover" data-current>
<?php endif; ?>
      <img alt="Vista previa de la foto elegida" class="absolute inset-0 h-full w-full object-cover" data-preview hidden>
    </div>
    <p class="text-sm text-ink-soft" data-unsaved hidden>Todavía no se guardó: apretá «Guardar foto».</p>

    <form method="post" action="/admin/eventos/<?= e($event['id']) ?>/foto" enctype="multipart/form-data" class="flex flex-col gap-3" data-photo-form>
      <?= Csrf::field() ?>
      <label for="photo" class="inline-flex min-h-10 w-fit cursor-pointer items-center justify-center rounded-md border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50">Elegir foto</label>
      <input id="photo" name="photo" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic" class="sr-only" data-photo-file>
      <p class="text-sm text-ink-soft">Permitidos: <?= e(EventImages::FORMATS_LABEL) ?>. Máximo 8MB. La foto se achica automáticamente antes de subir.</p>
<?php if ($photoNotice): ?>
      <p role="status" class="text-sm font-medium text-brand-700" data-photo-notice><?= e($photoNotice) ?></p>
<?php endif; ?>
      <p role="alert" class="text-sm font-medium text-accent-700" data-photo-error<?= $photoError ? '' : ' hidden' ?>><?= e($photoError ?? '') ?></p>
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-200" data-photo-save>Guardar foto</button>
      </div>
    </form>
<?php if ($event['image_url']): ?>
    <form method="post" action="/admin/eventos/<?= e($event['id']) ?>/foto/quitar">
      <?= Csrf::field() ?>
      <button type="submit" class="inline-flex min-h-10 items-center justify-center rounded-md border border-accent-200 px-4 text-sm font-medium text-accent-700 hover:bg-accent-50">Quitar foto</button>
    </form>
<?php endif; ?>
  </section>
</section>
<script src="/assets/js/event-photo.js" defer></script>
