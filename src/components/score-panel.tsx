import type { ScoreRow } from '@/lib/types/database';
import type { ScoreFactor } from '@/scoring/types';

/**
 * Risk bands get their own colour ramp running green through to red. The
 * mapping is fixed and used everywhere a band appears, so an officer learns
 * it once.
 */
const BAND: Record<
  ScoreRow['band'],
  { label: string; chip: string; bar: string; text: string }
> = {
  'very-low': {
    label: 'Very low risk',
    chip: 'bg-brand-50 text-brand-700',
    bar: 'bg-brand-500',
    text: 'text-brand-700',
  },
  low: {
    label: 'Low risk',
    chip: 'bg-brand-50 text-brand-700',
    bar: 'bg-brand-500',
    text: 'text-brand-700',
  },
  moderate: {
    label: 'Moderate risk',
    chip: 'bg-sun-50 text-sun-700',
    bar: 'bg-sun-500',
    text: 'text-sun-700',
  },
  high: {
    label: 'High risk',
    chip: 'bg-sun-50 text-sun-700',
    bar: 'bg-sun-600',
    text: 'text-sun-700',
  },
  'very-high': {
    label: 'Very high risk',
    chip: 'bg-danger-50 text-danger-700',
    bar: 'bg-danger-500',
    text: 'text-danger-700',
  },
};

const CONFIDENCE: Record<ScoreRow['confidence'], { label: string; chip: string }> =
  {
    high: { label: 'High confidence', chip: 'bg-sky-50 text-sky-700' },
    medium: { label: 'Medium confidence', chip: 'bg-sun-50 text-sun-700' },
    low: { label: 'Low confidence', chip: 'bg-danger-50 text-danger-700' },
  };

const SCORE_MIN = 300;
const SCORE_MAX = 850;

const money = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** jsonb comes back as unknown, so narrow it before rendering. */
function asFactors(value: unknown): ScoreFactor[] {
  return Array.isArray(value) ? (value as ScoreFactor[]) : [];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}

export function ScorePanel({ score }: { score: ScoreRow }) {
  const factors = asFactors(score.factors);
  const warnings = asStrings(score.warnings);
  const band = BAND[score.band];
  const confidence = CONFIDENCE[score.confidence];

  const positive = factors
    .filter((f) => f.available && f.contribution > 0)
    .slice(0, 4);
  const negative = factors
    .filter((f) => f.available && f.contribution < 0)
    .slice(0, 4);
  const unavailable = factors.filter((f) => !f.available);

  // Where the score sits on the 300-850 scale, as a percentage.
  const position = Math.min(
    100,
    Math.max(0, ((score.score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100),
  );
  const evidencePct = Math.round(Number(score.confidence_value) * 100);

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className={`h-1.5 ${band.bar}`} aria-hidden="true" />

      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* -------------------------------------------------- the score */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Credit score
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span
                className={`text-6xl font-bold tabular-nums leading-none ${band.text}`}
              >
                {score.score}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${band.chip}`}
              >
                {band.label}
              </span>
            </div>

            {/* A scale, not just a number. Where 640 sits between 300 and 850
                is not obvious to someone reading their first one. */}
            <div className="mt-5">
              <div
                className="relative h-2.5 rounded-full bg-linear-to-r from-danger-500 via-sun-500 to-brand-500"
                role="img"
                aria-label={`Score ${score.score} on a scale from ${SCORE_MIN} to ${SCORE_MAX}`}
              >
                <span
                  className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink-900 bg-white"
                  style={{ left: `${position}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs tabular-nums text-ink-500">
                <span>{SCORE_MIN}</span>
                <span>{SCORE_MAX}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${confidence.chip}`}
              >
                {confidence.label}
              </span>
              <span className="text-xs text-ink-500">
                built on {evidencePct}% of the evidence the model expects
              </span>
            </div>
          </div>

          {/* ------------------------------------------ probability + terms */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Chance of default
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-ink-900">
                {(Number(score.pd) * 100).toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-ink-500">
                over the recommended term
              </p>
            </div>

            <div className="rounded-xl border border-plum-100 bg-plum-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-plum-700">
                Recommended terms
              </p>
              {score.recommended_amount !== null &&
              score.recommended_term_months !== null ? (
                <>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-plum-700">
                    {money.format(Number(score.recommended_amount))}
                  </p>
                  <p className="mt-1 text-xs text-plum-700">
                    over {score.recommended_term_months} months
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-bold text-plum-700">
                    None recommended
                  </p>
                  <p className="mt-1 text-xs text-plum-700">
                    Decide this one by hand.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="mt-6 rounded-xl border border-sun-100 bg-sun-50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-sun-700">
              <span aria-hidden="true">⚠</span> Read before deciding
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-ink-700">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <FactorList
            title="What helped"
            accent="brand"
            empty="Nothing counted in this applicant’s favour."
            factors={positive}
          />
          <FactorList
            title="What counted against"
            accent="danger"
            empty="Nothing counted against this applicant."
            factors={negative}
          />
        </div>

        {unavailable.length > 0 && (
          <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4">
            <h3 className="text-sm font-bold text-ink-900">
              What we could not see
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-ink-500">
              {unavailable.map((factor) => (
                <li key={factor.key}>
                  <span className="font-semibold text-ink-700">
                    {factor.label}.
                  </span>{' '}
                  {factor.explanation}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 border-t border-ink-100 pt-4 text-xs text-ink-500">
          Scored {dateTime.format(new Date(score.scored_at))} using model{' '}
          {score.model_version}. The inputs behind this score are stored with it
          for audit.
        </p>
      </div>
    </section>
  );
}

function FactorList({
  title,
  accent,
  empty,
  factors,
}: {
  title: string;
  accent: 'brand' | 'danger';
  empty: string;
  factors: ScoreFactor[];
}) {
  const headingDot = accent === 'brand' ? 'bg-brand-500' : 'bg-danger-500';
  const points = accent === 'brand' ? 'text-brand-700' : 'text-danger-700';
  const chip = accent === 'brand' ? 'bg-brand-50' : 'bg-danger-50';

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <span className={`size-2 rounded-full ${headingDot}`} aria-hidden="true" />
        {title}
      </h3>
      {factors.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {factors.map((factor) => (
            <li key={factor.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-ink-900">
                  {factor.label}
                </span>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${chip} ${points}`}
                >
                  {factor.contribution > 0 ? '+' : ''}
                  {factor.contribution}
                </span>
              </div>
              <p className="mt-0.5 text-ink-500">{factor.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
