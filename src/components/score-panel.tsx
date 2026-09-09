import type { ScoreRow } from '@/lib/types/database';
import type { ScoreFactor } from '@/scoring/types';

const BAND_STYLES: Record<ScoreRow['band'], string> = {
  'very-low': 'bg-leaf-100 text-leaf-700',
  low: 'bg-leaf-100 text-leaf-700',
  moderate: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  'very-high': 'bg-red-100 text-red-800',
};

const BAND_LABELS: Record<ScoreRow['band'], string> = {
  'very-low': 'Very low risk',
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
  'very-high': 'Very high risk',
};

const CONFIDENCE_LABELS: Record<ScoreRow['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

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

  const positive = factors
    .filter((f) => f.available && f.contribution > 0)
    .slice(0, 4);
  const negative = factors
    .filter((f) => f.available && f.contribution < 0)
    .slice(0, 4);
  const unavailable = factors.filter((f) => !f.available);

  return (
    <section className="rounded-xl border border-soil-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-soil-700">Credit score</p>
          <p className="text-4xl font-semibold tabular-nums">{score.score}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BAND_STYLES[score.band]}`}
            >
              {BAND_LABELS[score.band]}
            </span>
            <span className="text-xs text-soil-700">
              {CONFIDENCE_LABELS[score.confidence]} (
              {Math.round(Number(score.confidence_value) * 100)}% of expected
              evidence)
            </span>
          </div>
        </div>

        <div className="text-sm">
          <p className="text-soil-700">Estimated default probability</p>
          <p className="text-2xl font-semibold tabular-nums">
            {(Number(score.pd) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="text-sm">
          <p className="text-soil-700">Recommended terms</p>
          {score.recommended_amount !== null &&
          score.recommended_term_months !== null ? (
            <p className="text-2xl font-semibold">
              {money.format(Number(score.recommended_amount))}
              <span className="ml-2 text-base font-normal text-soil-700">
                over {score.recommended_term_months} months
              </span>
            </p>
          ) : (
            <p className="mt-1 text-base font-medium text-soil-700">
              None recommended. Decide by hand.
            </p>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">
            Read before deciding
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <FactorList
          title="What helped"
          empty="Nothing counted in this applicant’s favour."
          factors={positive}
        />
        <FactorList
          title="What counted against"
          empty="Nothing counted against this applicant."
          factors={negative}
        />
      </div>

      {unavailable.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold">What we could not see</h3>
          <ul className="mt-2 space-y-2 text-sm text-soil-700">
            {unavailable.map((factor) => (
              <li key={factor.key}>
                <span className="font-medium">{factor.label}.</span>{' '}
                {factor.explanation}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 border-t border-soil-100 pt-4 text-xs text-soil-700">
        Scored {dateTime.format(new Date(score.scored_at))} using model{' '}
        {score.model_version}. The inputs behind this score are stored with it
        for audit.
      </p>
    </section>
  );
}

function FactorList({
  title,
  empty,
  factors,
}: {
  title: string;
  empty: string;
  factors: ScoreFactor[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {factors.length === 0 ? (
        <p className="mt-2 text-sm text-soil-700">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {factors.map((factor) => (
            <li key={factor.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{factor.label}</span>
                <span
                  className={`shrink-0 tabular-nums text-xs ${
                    factor.contribution > 0 ? 'text-leaf-700' : 'text-red-700'
                  }`}
                >
                  {factor.contribution > 0 ? '+' : ''}
                  {factor.contribution} pts
                </span>
              </div>
              <p className="mt-0.5 text-soil-700">{factor.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
