<?php /** @var string $href @var string $label */ ?>
<a href="<?= e($href) ?>" class="inline-flex w-fit items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
  <svg aria-hidden="true" viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8H3.5M7.5 4 3.5 8l4 4"/></svg>
  <?= e($label) ?>
</a>
