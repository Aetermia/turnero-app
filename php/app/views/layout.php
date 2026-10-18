<?php
/** @var string $content @var string|null $title */
$pageTitle = isset($title) && $title !== '' ? $title . ' · Casa de Antón' : 'Casa de Antón';
?>
<!doctype html>
<html lang="es" class="h-full antialiased">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($pageTitle) ?></title>
  <meta name="description" content="Espacio de encuentros en Argentina: talleres, charlas y actividades temáticas. Mirá los próximos eventos y reservá tu lugar.">
<?php if (!empty($noindex)): ?>
  <meta name="robots" content="noindex">
<?php endif; ?>
  <link rel="icon" href="/favicon.ico">
  <link rel="preload" href="/assets/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/cormorant-garamond-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/app.css?v=<?= e((string) @filemtime(ROOT_DIR . '/public/assets/app.css')) ?>">
</head>
<body class="flex min-h-full flex-col bg-paper text-ink">
  <?php /* Sticky so the logo and the way back home stay reachable while scrolling. */ ?>
  <header class="sticky top-0 z-50 border-b border-brand-100 bg-paper">
    <?= render_partial('partials/floral-garland') ?>
    <div class="relative flex w-full items-center px-4 py-4 sm:px-6">
      <a href="/" class="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
        <img src="/img/logo.webp" alt="Casa de Antón" width="562" height="262" class="h-9 w-auto">
        <span class="font-display text-xl font-semibold text-brand-800 sm:text-2xl">Casa de Antón</span>
      </a>
    </div>
  </header>

  <main class="flex flex-1 flex-col"><?= $content ?></main>

  <?= render_partial('partials/site-footer') ?>
</body>
</html>
