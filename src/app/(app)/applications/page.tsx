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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <p className="mt-1 text-sm text-soil-700">
            Every application your institution has taken in.
          </p>
        </div>
        <Link
          href="/applications/new"
          className="rounded-md bg-leaf-600 px-4 py-2 text-sm font-medium text-white hover:bg-leaf-700"
        >
          New application
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          Could not load applications: {error.message}
        </p>
      )}

      {!error && applications.length === 0 && (
        <div className="rounded-xl border border-dashed border-soil-100 bg-white p-10 text-center">
          <p className="text-sm text-soil-700">
            No applications yet. Start with the first farmer.
          </p>
          <Link
            href="/applications/new"
            className="mt-4 inline-block rounded-md bg-leaf-600 px-4 py-2 text-sm font-medium text-white hover:bg-leaf-700"
          >
            New application
          </Link>
        </div>
      )}

      {applications.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-soil-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-soil-100 text-xs uppercase tracking-wide text-soil-700">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Farmer</th>
                <th scope="col" className="px-4 py-3 font-medium">Crop</th>
                <th scope="col" className="px-4 py-3 font-medium">Farm size</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr
                  key={application.id}
                  className="border-b border-soil-100 last:border-0 hover:bg-soil-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/applications/${application.id}`}
                      className="font-medium hover:underline"
                    >
                      {application.farmer.name}
                    </Link>
                    <div className="text-xs text-soil-700">
                      {application.farmer.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {application.farmer.primary_crop}
                  </td>
                  <td className="px-4 py-3">
                    {Number(application.farmer.farm_size_ha).toFixed(2)} ha
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={application.status} />
                  </td>
                  <td className="px-4 py-3 text-soil-700">
                    {dateFormat.format(new Date(application.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
