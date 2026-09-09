import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/status-badge';
import { ScorePanel } from '@/components/score-panel';
import { ScoreButton } from './score-button';
import type { ApplicationWithFarmer, ScoreRow } from '@/lib/types/database';

const dateTimeFormat = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // A row in another institution is invisible to this query, so a cross-tenant
  // id is indistinguishable from one that does not exist. That is the point.
  const { data } = await supabase
    .from('applications')
    .select(
      'id, institution_id, farmer_id, status, consent_given, consent_at, created_by, created_at, updated_at, farmer:farmers!inner(id, name, phone, primary_crop, farm_size_ha, location_lat, location_lng)',
    )
    .eq('id', id)
    .maybeSingle()
    .overrideTypes<ApplicationWithFarmer>();

  if (!data) notFound();

  // Scores are kept rather than overwritten, so the most recent one is the
  // current assessment and the rest are history.
  const { data: latestScore } = await supabase
    .from('scores')
    .select('*')
    .eq('application_id', id)
    .order('scored_at', { ascending: false })
    .limit(1)
    .maybeSingle<ScoreRow>();

  const decided = data.status === 'approved' || data.status === 'declined';

  return (
    <div>
      <Link
        href="/applications"
        className="text-sm font-medium text-ink-500 hover:text-brand-700"
      >
        ← Applications
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink-900">
          {data.farmer.name}
        </h1>
        <StatusBadge status={data.status} />
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-5 rounded-2xl border border-ink-200 bg-white p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Mobile</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">{data.farmer.phone}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Main crop</dt>
          <dd className="mt-0.5 font-semibold capitalize text-ink-900">{data.farmer.primary_crop}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Farm size</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">
            {Number(data.farmer.farm_size_ha).toFixed(2)} ha
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Farm location</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">
            {data.farmer.location_lat.toFixed(5)},{' '}
            {data.farmer.location_lng.toFixed(5)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Consent</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">
            {data.consent_given && data.consent_at
              ? `Recorded ${dateTimeFormat.format(new Date(data.consent_at))}`
              : 'Not recorded'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Created</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">
            {dateTimeFormat.format(new Date(data.created_at))}
          </dd>
        </div>
      </dl>

      <div className="mt-6 space-y-6">
        {!decided && (
          <ScoreButton
            applicationId={data.id}
            alreadyScored={latestScore !== null}
          />
        )}

        {latestScore ? (
          <ScorePanel score={latestScore} />
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-sky-100 bg-sky-50 p-6 text-center">
            <p className="text-2xl" aria-hidden="true">
              🛰️
            </p>
            <p className="mt-2 font-semibold text-ink-900">Not scored yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
              Running a score gathers satellite, rainfall and mobile-money
              signals for this farm, then explains in plain language what drove
              the result.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
