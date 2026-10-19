<?php
/**
 * @var string|null $search
 * @var list<array<string, mixed>> $clients
 */
$hasSearch = $search !== null;
// The export and the copy button use exactly the list on screen.
$exportHref = $hasSearch ? '/admin/clientes/export?search=' . rawurlencode($search) : '/admin/clientes/export';
$emails = array_values(array_map(
    static fn (array $c): string => $c['email'],
    array_filter($clients, static fn (array $c): bool => $c['marketing_consent'] && trim($c['email']) !== '')
));
$plural = static fn (int $n, string $one, string $many): string => $n === 1 ? $one : $many;
$secondary = 'inline-flex min-h-10 items-center justify-center rounded-md border border-brand-200 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
?>
<section class="flex flex-col gap-6">
  <header class="flex flex-col gap-1">
    <span class="text-xs font-semibold uppercase tracking-wide text-accent-600">Clientes</span>
    <h1 class="text-2xl font-bold text-brand-900">Clientes</h1>
    <p class="text-ink-soft">Tu base de contactos: mirá qué reservó cada persona y exportala en CSV.</p>
  </header>

  <form method="get" class="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white p-4 sm:flex-row sm:items-end">
    <div class="flex flex-1 flex-col gap-1.5">
      <label for="search" class="text-sm font-semibold text-brand-800">Nombre, email o WhatsApp</label>
      <input id="search" name="search" type="search" value="<?= e($search ?? '') ?>" placeholder="Ej.: María, maria@… o +54 9 11…" class="min-h-10 w-full rounded-md border border-brand-200 bg-white px-3 text-sm text-ink outline-none focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600">
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button type="submit" class="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Filtrar</button>
<?php if ($hasSearch): ?>
      <a href="/admin/clientes" class="<?= $secondary ?>">Limpiar</a>
<?php endif; ?>
      <button type="button" data-copy-emails="<?= e((string) json_encode($emails, JSON_UNESCAPED_UNICODE)) ?>"<?= $emails === [] ? ' disabled' : '' ?> title="<?= e($emails === [] ? 'No hay clientes para copiar' : 'Copia ' . count($emails) . ' ' . $plural(count($emails), 'mail', 'mails')) ?>" class="<?= $secondary ?> disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent">Copiar mails</button>
      <a href="<?= e($exportHref) ?>" class="<?= $secondary ?>">Exportar CSV</a>
    </div>
  </form>

<?php if ($clients === []): ?>
  <p class="rounded-lg border border-dashed border-brand-200 bg-white p-6 text-sm text-ink-soft"><?= $hasSearch ? 'No hay clientes que coincidan con la búsqueda.' : 'Todavía no hay clientes.' ?></p>
<?php else: ?>
  <ul class="flex flex-col gap-3">
<?php foreach ($clients as $client): ?>
    <li class="flex flex-col gap-1 rounded-lg border border-brand-100 bg-white p-4">
      <span class="font-semibold text-brand-900"><?= e($client['full_name']) ?></span>
      <span class="text-sm text-ink-soft"><?= e(Clients::visibleEmail($client)) ?> · <?= e($client['whatsapp']) ?></span>
      <span class="text-sm text-ink-soft"><?= $client['total_reservations'] ?> <?= $plural($client['total_reservations'], 'reserva', 'reservas') ?> · <?= $client['active_reservations'] ?> <?= $plural($client['active_reservations'], 'activa', 'activas') ?></span>
      <span class="text-xs text-ink-soft"><?= $client['last_reservation_at'] !== null ? e('Última reserva · ' . Format::dateTime($client['last_reservation_at'])) : 'Sin reservas' ?></span>
    </li>
<?php endforeach; ?>
  </ul>
<?php endif; ?>
</section>
<script src="/assets/js/copy-emails.js" defer></script>
