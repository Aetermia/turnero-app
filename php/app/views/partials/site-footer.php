<?php
/*
 * Venue details, as published on the venue's Instagram profile. Kept in one
 * place so a change of address, phone or hours is a one-line edit.
 */
$venue = [
    'address' => 'Monseñor de Andrea 202, Tandil',
    'mapsUrl' => 'https://www.google.com/maps/search/?api=1&query=Monse%C3%B1or+de+Andrea+202%2C+Tandil%2C+Argentina',
    'whatsappLabel' => '2494 31-4915',
    'whatsappUrl' => 'https://wa.me/5492494314915',
    'instagramHandle' => '@casadeantontandil',
    'instagramUrl' => 'https://www.instagram.com/casadeantontandil/',
];
$linkClass = 'text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
?>
<footer class="border-t border-brand-100 bg-paper">
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 text-sm text-ink-soft sm:flex-row sm:items-start sm:justify-between">
    <div class="flex flex-col gap-1">
      <p class="font-display text-xl font-semibold text-brand-800">Casa de Antón</p>
      <p>Casa de té · Talleres y encuentros</p>
    </div>
    <ul class="flex flex-col gap-1.5">
      <li>
        <a href="<?= e($venue['mapsUrl']) ?>" target="_blank" rel="noopener noreferrer" class="<?= $linkClass ?>"><?= e($venue['address']) ?></a>
      </li>
      <li>
        WhatsApp:
        <a href="<?= e($venue['whatsappUrl']) ?>" target="_blank" rel="noopener noreferrer" class="<?= $linkClass ?>"><?= e($venue['whatsappLabel']) ?></a>
      </li>
      <li>
        Instagram:
        <a href="<?= e($venue['instagramUrl']) ?>" target="_blank" rel="noopener noreferrer" class="<?= $linkClass ?>"><?= e($venue['instagramHandle']) ?></a>
      </li>
    </ul>
  </div>
</footer>
