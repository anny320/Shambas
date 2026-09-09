import Link from 'next/link';
import { IntakeForm } from './intake-form';

export const metadata = { title: 'New application · Shamba Score' };

export default function NewApplicationPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/applications"
          className="text-sm text-soil-700 hover:underline"
        >
          ← Applications
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          New application
        </h1>
        <p className="mt-1 text-sm text-soil-700">
          Capture the farmer, pin the farm, and record consent.
        </p>
      </div>
      <IntakeForm />
    </div>
  );
}
