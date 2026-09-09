import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/status-badge';
import type { ApplicationWithFarmer } from '@/lib/types/database';

export const metadata = { title: 'Applications · Shamba Score' };

const dateFormat = new Intl.DateTimeFormat('en-KE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Left edge colour per status, so the list is scannable without reading. */
const EDGE: Record<ApplicationWithFarmer['status'], string> = {
  draft: 'bg-ink-300',
  submitted: 'bg-sun-500',
  scored: 'bg-sky-500',
  approved: 'bg-brand-500',
  declined: 'bg-danger-500',
};

export default async function ApplicationsPage() {
  const supabase = await createClient();

  /*
   * No institution filter here on purpose. Row Level Security scopes this to
   * the caller's own institution, and adding a client-side filter would
   * suggest the isolation lives in this query rather than in the database.
   */
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, institution_id, farmer_id, status, consent_given, consent_at, created_by, created_at, updated_at, farmer:farmers!inner(id, name, phone, primary_crop, farm_size_ha, location_lat, location_lng)',
    )
    .order('created_at', { ascending: false })
    .limit(200)
    .overrideTypes<ApplicationWithFarmer[]>();

  const applications = data ?? [];

  const counts = {
    submitted: applications.filter((a) => a.status === 'submitted').length,
    scored: applications.filter((a) => a.status === 'scored').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    declined: applications.filter((a) => a.status === 'declined').length,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink-900">
            Applications
          </h1>
          <p className="mt-1 text-ink-500">
            Every application your institution has taken in.
          </p>
        </div>
        <Link
          href="/applications/new"
          className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          + New application
        </Link>
      </div>

      {applications.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile
            label="Awaiting a score"
            value={counts.submitted}
            tone="bg-sun-50 text-sun-700"
            bar="bg-sun-500"
          />
          <SummaryTile
            label="Scored"
            value={counts.scored}
            tone="bg-sky-50 text-sky-700"
            bar="bg-sky-500"
          />
          <SummaryTile
            label="Approved"
            value={counts.approved}
            tone="bg-brand-50 text-brand-700"
            bar="bg-brand-500"
          />
          <SummaryTile
            label="Declined"
            value={counts.declined}
            tone="bg-danger-50 text-danger-700"
            bar="bg-danger-500"
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-100 bg-danger-50 p-4 text-sm text-danger-700"
        >
          Could not load applications: {error.message}
        </p>
      )}

      {!error && applications.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 bg-white p-12 text-center">
          <div
            className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl"
            aria-hidden="true"
          >
            🌱
          </div>
          <h2 className="mt-4 text-lg font-bold text-ink-900">
            No applications yet
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
            Start with a farmer. Capture their details, pin the farm, record
            consent, and you can score them straight away.
          </p>
          <Link
            href="/applications/new"
            className="mt-6 inline-block rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Create the first application
          </Link>
        </div>
      )}

      {applications.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="py-3 pl-5 pr-4 font-semibold">
                    Farmer
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">Crop</th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Farm size
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr
                    key={application.id}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50"
                  >
                    <td className="relative py-3.5 pl-5 pr-4">
                      <span
                        className={`absolute inset-y-0 left-0 w-1 ${EDGE[application.status]}`}
                        aria-hidden="true"
                      />
                      <Link
                        href={`/applications/${application.id}`}
                        className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        {application.farmer.name}
                      </Link>
                      <div className="text-xs text-ink-500">
                        {application.farmer.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-md bg-sun-50 px-2 py-0.5 text-xs font-semibold capitalize text-sun-700">
                        {application.farmer.primary_crop}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-ink-700">
                      {Number(application.farmer.farm_size_ha).toFixed(2)} ha
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={application.status} />
                    </td>
                    <td className="px-4 py-3.5 text-ink-500">
                      {dateFormat.format(new Date(application.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  bar,
}: {
  label: string;
  value: number;
  tone: string;
  bar: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className={`h-1 ${bar}`} aria-hidden="true" />
      <div className="p-4">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}
        >
          {label}
        </span>
        <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">
          {value}
        </p>
      </div>
    </div>
  );
}
