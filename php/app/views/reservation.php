<?php
/*
 * Public status page reached with the secret link (/reservas/{token}).
 * Minimal version for P5; P6 adds the payment step and P10 the full set of
 * states.
 *
 * @var array<string, mixed> $reservation
 */
?>
<div class="mx-auto w-full max-w-3xl px-4 py-8">
  <header class="flex flex-col gap-2">
    <p class="text-xs font-semibold uppercase tracking-wide text-accent-600">Paso 2 de 2 · Pago</p>
    <h1 class="font-display text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">Te guardamos el lugar</h1>
    <p class="text-ink-soft">Reserva para <strong class="text-ink"><?= e($reservation['event_title']) ?></strong>.</p>
  </header>
</div>
