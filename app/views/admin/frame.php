<?php
/*
 * Shared frame of every panel screen (port of src/app/admin/(panel)/layout.tsx
 * and panel-back-link.tsx): who is logged in, the way back to the dashboard
 * (hidden on the dashboard itself) and "Cerrar sesión".
 *
 * @var string $adminUser
 * @var string $panelContent
 * @var bool $isDashboard
 */
?>
<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-8">
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white px-4 py-3">
    <div class="flex flex-col">
      <span class="text-xs font-semibold uppercase tracking-wide text-accent-600">Administración</span>
      <span class="text-sm text-ink-soft">Sesión de <?= e($adminUser) ?></span>
    </div>
    <div class="flex items-center gap-3">
<?php if (!$isDashboard): ?>
      <a href="/admin" class="text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">← Volver al panel</a>
<?php endif; ?>
      <form method="post" action="/admin/logout">
        <?= Csrf::field() ?>
        <button type="submit" class="inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Cerrar sesión</button>
      </form>
    </div>
  </div>
  <?= $panelContent ?>
</div>
