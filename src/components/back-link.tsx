import Link from "next/link";

/** Pill-shaped "go back" link that matches the brand's thin navy line style. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13 8H3.5M7.5 4 3.5 8l4 4" />
      </svg>
      {children}
    </Link>
  );
}
