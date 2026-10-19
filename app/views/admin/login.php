<?php /** @var string|null $errorMessage */ ?>
<div class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
  <section class="rounded-lg border border-brand-100 bg-white p-6">
    <span class="text-xs font-semibold uppercase tracking-wide text-accent-600">Acceso privado</span>
    <h1 class="mt-1 text-2xl font-bold text-brand-900">Panel de administración</h1>
    <p class="mt-1 text-sm text-ink-soft">Ingresá con tu usuario y contraseña para administrar los eventos.</p>

    <form method="post" action="/admin/login" class="mt-6 flex flex-col gap-4">
      <?= Csrf::field() ?>
      <div>
        <label for="username" class="block text-sm font-medium text-ink">Usuario</label>
        <input id="username" name="username" type="text" required autocomplete="username" class="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none">
      </div>
      <div>
        <label for="password" class="block text-sm font-medium text-ink">Contraseña</label>
        <input id="password" name="password" type="password" required autocomplete="current-password" class="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none">
      </div>
<?php if ($errorMessage): ?>
      <p role="alert" class="text-sm text-red-600"><?= e($errorMessage) ?></p>
<?php endif; ?>
      <button type="submit" class="inline-flex min-h-12 items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Ingresar</button>
    </form>
  </section>
  <p class="mt-4 text-center text-sm text-ink-soft">
    <a href="/" class="font-semibold text-brand-700 hover:underline">Volver al sitio</a>
  </p>
</div>
