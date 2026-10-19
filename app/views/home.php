<?php /** @var list<array<string, mixed>> $events */ ?>
<?php /* Narrower column than other pages: the full-width 3:4 photos would otherwise push each event past the screen height. */ ?>
<div class="mx-auto w-full max-w-2xl px-4 py-8">
  <section class="mb-6 flex flex-col gap-2">
    <h1 class="font-display text-4xl font-semibold text-brand-900 sm:text-5xl">Próximos eventos</h1>
    <p class="text-ink-soft">Elegí un encuentro y reservá tu lugar. El pago se realiza por transferencia bancaria.</p>
  </section>

<?php if ($events === []): ?>
  <p class="rounded-lg border border-brand-100 bg-white p-6 text-center text-ink-soft">
    Todavía no hay eventos programados. Volvé pronto para conocer las próximas actividades.
  </p>
<?php else: ?>
  <ul class="flex flex-col gap-8">
<?php foreach ($events as $event): ?>
    <li><?= render_partial('partials/event-card', ['event' => $event]) ?></li>
<?php endforeach; ?>
  </ul>
<?php endif; ?>
</div>
