import Link from 'next/link';
import { IntakeForm } from './intake-form';

export const metadata = { title: 'New application · Shamba Score' };

export default function NewApplicationPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/applications"
          className="text-sm font-medium text-ink-500 hover:text-brand-700"
        >
          ← Applications
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
          New application
        </h1>
        <p className="mt-1 text-ink-500">
          Three steps: capture the farmer, pin the farm, record consent.
        </p>
      </div>
      <IntakeForm />
    </div>
  );
}
