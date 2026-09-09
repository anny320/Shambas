import type { ApplicationStatus } from '@/lib/types/database';

/**
 * Colour carries the meaning here, not decoration. Each status gets its own
 * accent so an officer can read a list of thirty applications by colour alone
 * and only fall back to the words when two are adjacent.
 *
 * Text is always the 700 shade on the 50 tint, which clears WCAG AA.
 */
const STYLES: Record<
  ApplicationStatus,
  { label: string; className: string; dot: string }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-ink-100 text-ink-700',
    dot: 'bg-ink-500',
  },
  submitted: {
    label: 'Submitted',
    className: 'bg-sun-50 text-sun-700',
    dot: 'bg-sun-500',
  },
  scored: {
    label: 'Scored',
    className: 'bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
  },
  approved: {
    label: 'Approved',
    className: 'bg-brand-50 text-brand-700',
    dot: 'bg-brand-500',
  },
  declined: {
    label: 'Declined',
    className: 'bg-danger-50 text-danger-700',
    dot: 'bg-danger-500',
  },
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { label, className, dot } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {/* A shape as well as a colour, so the status survives a colour-blind
          reader or a black-and-white printout of the portfolio. */}
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
