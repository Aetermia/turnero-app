<?php
/** @var string $status effective status */
$badgeClasses = [
    'pending_no_receipt' => 'bg-brand-50 text-brand-700',
    'pending_review' => 'bg-accent-50 text-accent-700',
    'approved' => 'bg-brand-700 text-white',
    'rejected' => 'bg-accent-700 text-white',
    'expired' => 'bg-brand-50 text-ink-soft',
    'cancelled' => 'bg-brand-50 text-ink-soft',
];
?>
<span class="rounded-full px-2 py-0.5 text-xs font-semibold <?= $badgeClasses[$status] ?? 'bg-brand-50 text-ink-soft' ?>"><?= e(Format::reservationStatus($status)) ?></span>
