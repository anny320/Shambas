import type { ApplicationStatus } from '@/lib/types/database';

const STYLES: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-soil-100 text-soil-700' },
  submitted: { label: 'Submitted', className: 'bg-amber-100 text-amber-800' },
  scored: { label: 'Scored', className: 'bg-sky-100 text-sky-800' },
  approved: { label: 'Approved', className: 'bg-leaf-100 text-leaf-700' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
