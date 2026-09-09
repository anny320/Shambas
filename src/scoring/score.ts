import type { FeatureBundle } from '@/adapters/types';
import {
  AMOUNT_ROUNDING_KES,
  ANCHORS,
  BAND_EXPOSURE_MULTIPLIER,
  CLIMATE_RISK_WEIGHTS,
  CONFIDENCE_BANDS,
  DEFAULT_TERM_MONTHS,
  FAMILY_LABELS,
  FAMILY_WEIGHTS,
  FARM_PRODUCTIVITY_WEIGHTS,
  FINANCIAL_BEHAVIOUR_WEIGHTS,
  INPUT_COST_PER_HA_KES,
  MAX_DEBT_SERVICE_RATIO,
  MIN_EVIDENCE_FOR_TERMS,
  MIN_RECOMMENDED_AMOUNT_KES,
  MISSING_FAMILY_EXPOSURE_CAP,
  MODEL_VERSION,
  NO_INCOME_SIGNAL_MULTIPLIER,
  PD_AT_BEST,
  PD_AT_WORST,
  RISK_BANDS,
  SCORE_MAX,
  SCORE_MIN,
  TERM_MONTHS_BY_CROP,
  THIN_FILE_ANCHOR,
  type RiskBand,
  type SignalFamily,
} from '@/scoring/weights';
import type {
  ConfidenceLevel,
  RecommendedTerms,
  ScoreConfidence,
  ScoreFactor,
  ScoreResult,
} from '@/scoring/types';

/**
 * ===========================================================================
 * The scoring engine.
 *
 * PURE AND I/O-FREE, DELIBERATELY. It takes a feature bundle and returns a
 * result. It reads no clock, no environment, no database, and no network. Two
 * consequences follow, and both are the point:
 *
 *   1. It is trivially testable. Every branch is reachable from a plain
 *      object, so the model's behaviour can be pinned down exhaustively.
 *   2. It is replaceable. When there is enough repayment data to train on,
 *      a model swaps in behind this same signature without touching the app.
 *
 * Keep it that way. If this function ever needs to fetch something, the fetch
 * belongs in an adapter and its result belongs in the bundle.
 * ===========================================================================
 */
export function score(bundle: FeatureBundle): ScoreResult {
  const factors: ScoreFactor[] = [];
  const warnings: string[] = [];

  const productivity = scoreFarmProductivity(bundle, factors, warnings);
  const climate = scoreClimateRisk(bundle, factors, warnings);
  const financial = scoreFinancialBehaviour(bundle, factors, warnings);

  const familyScores: Record<SignalFamily, number | null> = {
    farmProductivity: productivity.value,
    climateRisk: climate.value,
    financialBehaviour: financial.value,
  };

  const families = [
    ['farmProductivity', productivity] as const,
    ['climateRisk', climate] as const,
    ['financialBehaviour', financial] as const,
  ] satisfies ReadonlyArray<readonly [SignalFamily, FamilyScore]>;

  const present = families.filter(([, family]) => family.value !== null);
  const missingFamilyCount = families.length - present.length;

  /*
   * Combining families is where a naive design leaks.
   *
   * The obvious approach — average whichever families reported, ignoring the
   * rest — quietly rewards withholding your worst signal, because dropping
   * the lowest number raises the mean of what is left. An applicant whose
   * income record is bad would score better by not linking it, and the
   * product would be teaching people to hide their weakest evidence.
   *
   * So a missing family is not skipped. It is substituted at no better than
   * the conservative anchor, and no better than what the present evidence
   * already suggests. Absence therefore never reads as strength.
   */
  const presentMean =
    present.length === 0
      ? THIN_FILE_ANCHOR
      : weightedMean(
          present.map(([name, family]) => ({
            weight: FAMILY_WEIGHTS[name],
            value: family.value as number,
          })),
        );

  const substitute = Math.min(presentMean, THIN_FILE_ANCHOR);

  const rawScore01 = weightedMean(
    families.map(([name, family]) => ({
      weight: FAMILY_WEIGHTS[name],
      value: family.value ?? substitute,
    })),
  );

  const confidence = assessConfidence(bundle, productivity, climate, financial);
  const adjusted01 = applyThinFileShrinkage(rawScore01, confidence.evidence);

  if (adjusted01 < rawScore01) {
    const lost = Math.round((rawScore01 - adjusted01) * (SCORE_MAX - SCORE_MIN));
    factors.push({
      key: 'thin-file-adjustment',
      label: 'Incomplete evidence',
      family: 'farmProductivity',
      direction: 'negative',
      contribution: -lost,
      normalised: confidence.evidence,
      explanation:
        `Part of the expected evidence was missing, so the score was held ` +
        `down by ${lost} points rather than assuming the missing signals ` +
        `were favourable.`,
      available: true,
    });
  }

  const finalScore = Math.round(
    SCORE_MIN + adjusted01 * (SCORE_MAX - SCORE_MIN),
  );
  const probabilityOfDefault = defaultProbabilityFor(adjusted01);
  const { band, label: bandLabel } = bandFor(probabilityOfDefault);

  const terms = recommendTerms(
    bundle,
    band,
    confidence,
    missingFamilyCount,
    warnings,
  );

  factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    score: finalScore,
    band,
    bandLabel,
    probabilityOfDefault: roundTo(probabilityOfDefault, 4),
    confidence,
    terms,
    factors,
    familyScores,
    modelVersion: MODEL_VERSION,
    sources: [
      bundle.satellite.source,
      bundle.weather.source,
      bundle.mobileMoney.source,
    ],
    warnings,
  };
}

// ===========================================================================
// Families
// ===========================================================================

interface FamilyScore {
  /** 0 to 1, or null when the family had no usable signal at all. */
  value: number | null;
  /** Share of this family's weight that was actually informed, 0 to 1. */
  coverage: number;
  /**
   * Share of this family's weight that was informed AND well evidenced, 0 to
   * 1. Distinct from coverage: a signal can be present but thin.
   */
  evidence: number;
}

function scoreFarmProductivity(
  bundle: FeatureBundle,
  factors: ScoreFactor[],
  warnings: string[],
): FamilyScore {
  const parts: WeightedPart[] = [];
  const features = bundle.satellite.features;
  const family: SignalFamily = 'farmProductivity';

  if (features) {
    const vsNorm = normalise(
      features.ndviVsRegionalNorm,
      ANCHORS.ndviVsRegionalNorm,
    );
    parts.push({
      key: 'ndvi-vs-regional-norm',
      weight: FARM_PRODUCTIVITY_WEIGHTS.ndviVsRegionalNorm,
      value: vsNorm,
      completeness: blend(bundle.satellite.completeness),
    });
    factors.push(
      factorFor({
        key: 'ndvi-vs-regional-norm',
        label: 'Vegetation against the regional norm',
        family,
        normalised: vsNorm,
        weight:
          FAMILY_WEIGHTS.farmProductivity *
          FARM_PRODUCTIVITY_WEIGHTS.ndviVsRegionalNorm,
        explanation:
          vsNorm >= 0.5
            ? `Crop cover on this farm is running at ${Math.round(features.ndviVsRegionalNorm * 100)}% of what is normal for the area, which is at or above par.`
            : `Crop cover on this farm is running at ${Math.round(features.ndviVsRegionalNorm * 100)}% of what is normal for the area, which is below par for the region.`,
      }),
    );

    const yearOnYear = normalise(
      features.ndviYearOnYearRatio,
      ANCHORS.ndviYearOnYear,
    );
    parts.push({
      key: 'ndvi-year-on-year',
      weight: FARM_PRODUCTIVITY_WEIGHTS.ndviYearOnYear,
      value: yearOnYear,
      completeness: blend(bundle.satellite.completeness),
    });
    const changePct = Math.round((features.ndviYearOnYearRatio - 1) * 100);
    factors.push(
      factorFor({
        key: 'ndvi-year-on-year',
        label: 'Year-on-year vegetation trend',
        family,
        normalised: yearOnYear,
        weight:
          FAMILY_WEIGHTS.farmProductivity *
          FARM_PRODUCTIVITY_WEIGHTS.ndviYearOnYear,
        explanation:
          changePct === 0
            ? 'Crop cover is level with the same season last year.'
            : changePct > 0
              ? `Crop cover is ${changePct}% stronger than the same season last year.`
              : `Crop cover is ${Math.abs(changePct)}% weaker than the same season last year.`,
      }),
    );
  } else {
    warnings.push(
      'No satellite view of this farm. Farm productivity could not be ' +
        'assessed from imagery.',
    );
    factors.push(missingFactor({
      key: 'ndvi-vs-regional-norm',
      label: 'Vegetation against the regional norm',
      family,
      explanation:
        'No usable satellite imagery for this farm, so its productivity ' +
        'could not be checked against the regional norm.',
    }));
  }

  // Farm scale comes from the intake form, so it survives a satellite outage.
  const scale = normalise(bundle.context.farmSizeHa, ANCHORS.farmSizeHa);
  parts.push({
    key: 'farm-scale',
    weight: FARM_PRODUCTIVITY_WEIGHTS.farmScale,
    value: scale,
    // Measured by the officer at intake, so there is no upstream source that
    // could be thin. It survives a satellite outage intact.
    completeness: 1,
  });
  factors.push(
    factorFor({
      key: 'farm-scale',
      label: 'Farm size',
      family,
      normalised: scale,
      weight:
        FAMILY_WEIGHTS.farmProductivity * FARM_PRODUCTIVITY_WEIGHTS.farmScale,
      explanation:
        scale >= 0.5
          ? `At ${bundle.context.farmSizeHa} ha the farm is large enough to carry a marketable surplus.`
          : `At ${bundle.context.farmSizeHa} ha the farm is small, which limits the surplus available to repay from.`,
    }),
  );

  return combine(parts, FARM_PRODUCTIVITY_WEIGHTS);
}

function scoreClimateRisk(
  bundle: FeatureBundle,
  factors: ScoreFactor[],
  warnings: string[],
): FamilyScore {
  const family: SignalFamily = 'climateRisk';
  const features = bundle.weather.features;

  if (!features) {
    warnings.push(
      'No rainfall history for this location. Climate risk could not be ' +
        'assessed.',
    );
    factors.push(missingFactor({
      key: 'rainfall-reliability',
      label: 'Rainfall reliability',
      family,
      explanation:
        'No rainfall history was available for this location, so climate ' +
        'risk could not be assessed.',
    }));
    return { value: null, coverage: 0, evidence: 0 };
  }

  const parts: WeightedPart[] = [];

  const reliability = normalise(
    features.rainfallReliability,
    ANCHORS.rainfallReliability,
  );
  parts.push({
    key: 'rainfall-reliability',
    weight: CLIMATE_RISK_WEIGHTS.rainfallReliability,
    value: reliability,
    completeness: blend(bundle.weather.completeness),
  });
  factors.push(
    factorFor({
      key: 'rainfall-reliability',
      label: 'Rainfall reliability',
      family,
      normalised: reliability,
      weight: FAMILY_WEIGHTS.climateRisk * CLIMATE_RISK_WEIGHTS.rainfallReliability,
      explanation:
        reliability >= 0.5
          ? 'Rainfall here is dependable enough from season to season for a farmer to plan around.'
          : 'Rainfall here varies sharply from season to season, which makes any single harvest less predictable.',
    }),
  );

  const drought = normalise(
    features.droughtSeasonsLast5,
    ANCHORS.droughtSeasonsLast5,
  );
  parts.push({
    key: 'drought-history',
    weight: CLIMATE_RISK_WEIGHTS.droughtHistory,
    value: drought,
    completeness: blend(bundle.weather.completeness),
  });
  factors.push(
    factorFor({
      key: 'drought-history',
      label: 'Recent drought history',
      family,
      normalised: drought,
      weight: FAMILY_WEIGHTS.climateRisk * CLIMATE_RISK_WEIGHTS.droughtHistory,
      explanation:
        features.droughtSeasonsLast5 === 0
          ? 'No drought seasons at this location in the last five.'
          : `${features.droughtSeasonsLast5} of the last 5 seasons here were drought seasons.`,
    }),
  );

  // Only shortfall counts here. Excess rain is a different hazard, carried by
  // the flood counter, and must not read as a strong season.
  const rainfallVsNorm = normalise(
    Math.min(features.rainfallVsNormRatio, 1),
    ANCHORS.rainfallVsNorm,
  );
  parts.push({
    key: 'rainfall-vs-norm',
    weight: CLIMATE_RISK_WEIGHTS.rainfallVsNorm,
    value: rainfallVsNorm,
    completeness: blend(bundle.weather.completeness),
  });
  factors.push(
    factorFor({
      key: 'rainfall-vs-norm',
      label: 'This season’s rainfall',
      family,
      normalised: rainfallVsNorm,
      weight: FAMILY_WEIGHTS.climateRisk * CLIMATE_RISK_WEIGHTS.rainfallVsNorm,
      explanation:
        features.rainfallVsNormRatio >= 0.95
          ? `Season rainfall of ${features.seasonRainfallMm} mm is at or above the local norm.`
          : `Season rainfall of ${features.seasonRainfallMm} mm is ${Math.round((1 - features.rainfallVsNormRatio) * 100)}% below the local norm.`,
    }),
  );

  const drySpell = normalise(
    features.longestDrySpellDays,
    ANCHORS.longestDrySpellDays,
  );
  parts.push({
    key: 'dry-spell',
    weight: CLIMATE_RISK_WEIGHTS.drySpell,
    value: drySpell,
    completeness: blend(bundle.weather.completeness),
  });
  factors.push(
    factorFor({
      key: 'dry-spell',
      label: 'Longest dry spell',
      family,
      normalised: drySpell,
      weight: FAMILY_WEIGHTS.climateRisk * CLIMATE_RISK_WEIGHTS.drySpell,
      explanation: `The longest run without rain this season was ${features.longestDrySpellDays} days.`,
    }),
  );

  if (features.floodSeasonsLast5 >= 2) {
    warnings.push(
      `${features.floodSeasonsLast5} of the last 5 seasons at this location ` +
        'saw rainfall far above norm, so flood damage is a live risk here.',
    );
  }

  return combine(parts, CLIMATE_RISK_WEIGHTS);
}

function scoreFinancialBehaviour(
  bundle: FeatureBundle,
  factors: ScoreFactor[],
  warnings: string[],
): FamilyScore {
  const family: SignalFamily = 'financialBehaviour';
  const features = bundle.mobileMoney.features;

  if (!features) {
    warnings.push(
      'No mobile-money history for this farmer. This is missing evidence, ' +
        'not evidence of poor financial behaviour.',
    );
    factors.push(missingFactor({
      key: 'inflow-regularity',
      label: 'Income regularity',
      family,
      explanation:
        'No mobile-money history could be linked, so income regularity is ' +
        'unknown. Treat this as a gap in the file rather than a negative.',
    }));
    return { value: null, coverage: 0, evidence: 0 };
  }

  const parts: WeightedPart[] = [];

  const regularity = normalise(
    features.inflowRegularity,
    ANCHORS.inflowRegularity,
  );
  parts.push({
    key: 'inflow-regularity',
    weight: FINANCIAL_BEHAVIOUR_WEIGHTS.inflowRegularity,
    value: regularity,
    completeness: blend(bundle.mobileMoney.completeness),
  });
  factors.push(
    factorFor({
      key: 'inflow-regularity',
      label: 'Income regularity',
      family,
      normalised: regularity,
      weight:
        FAMILY_WEIGHTS.financialBehaviour *
        FINANCIAL_BEHAVIOUR_WEIGHTS.inflowRegularity,
      explanation:
        regularity >= 0.5
          ? `Money comes in steadily across the ${features.monthsObserved} months observed.`
          : `Income across the ${features.monthsObserved} months observed is irregular, which makes a fixed repayment harder to meet.`,
    }),
  );

  const income = normalise(
    features.medianMonthlyInflowKes,
    ANCHORS.medianMonthlyInflowKes,
  );
  parts.push({
    key: 'income-level',
    weight: FINANCIAL_BEHAVIOUR_WEIGHTS.incomeLevel,
    value: income,
    completeness: blend(bundle.mobileMoney.completeness),
  });
  factors.push(
    factorFor({
      key: 'income-level',
      label: 'Income level',
      family,
      normalised: income,
      weight:
        FAMILY_WEIGHTS.financialBehaviour *
        FINANCIAL_BEHAVIOUR_WEIGHTS.incomeLevel,
      explanation: `Median money in is about KES ${features.medianMonthlyInflowKes.toLocaleString('en-KE')} a month.`,
    }),
  );

  const buffer = normalise(
    features.averageBalanceKes / Math.max(features.medianMonthlyInflowKes, 1),
    ANCHORS.balanceToInflowRatio,
  );
  parts.push({
    key: 'balance-buffer',
    weight: FINANCIAL_BEHAVIOUR_WEIGHTS.balanceBuffer,
    value: buffer,
    completeness: blend(bundle.mobileMoney.completeness),
  });
  factors.push(
    factorFor({
      key: 'balance-buffer',
      label: 'Cash buffer',
      family,
      normalised: buffer,
      weight:
        FAMILY_WEIGHTS.financialBehaviour *
        FINANCIAL_BEHAVIOUR_WEIGHTS.balanceBuffer,
      explanation:
        buffer >= 0.5
          ? 'A reasonable cash balance is held between inflows, which absorbs a bad month.'
          : 'Very little cash is held between inflows, so a bad month leaves no cushion.',
    }),
  );

  /*
   * Prior repayment is scored only when prior credit exists. A farmer who has
   * never borrowed has not repaid badly, and treating null as a low rate
   * would penalise exactly the thin-file borrowers this product is for. The
   * weight is redistributed across the other signals instead, and the gap is
   * reported.
   */
  if (features.priorRepaymentRate !== null) {
    const repayment = normalise(
      features.priorRepaymentRate,
      ANCHORS.priorRepaymentRate,
    );
    parts.push({
      key: 'prior-repayment',
      weight: FINANCIAL_BEHAVIOUR_WEIGHTS.priorRepayment,
      value: repayment,
      completeness: blend(bundle.mobileMoney.completeness),
    });
    factors.push(
      factorFor({
        key: 'prior-repayment',
        label: 'Prior repayment record',
        family,
        normalised: repayment,
        weight:
          FAMILY_WEIGHTS.financialBehaviour *
          FINANCIAL_BEHAVIOUR_WEIGHTS.priorRepayment,
        explanation: `About ${Math.round(features.priorRepaymentRate * 100)}% of previous obligations were met on time.`,
      }),
    );
  } else {
    factors.push(missingFactor({
      key: 'prior-repayment',
      label: 'Prior repayment record',
      family,
      explanation:
        'No previous credit was observed, so there is no repayment record ' +
        'either way. This is not counted against the applicant.',
    }));
  }

  /*
   * There are two different kinds of absence, and conflating them is how a
   * thin-file model quietly becomes unfair.
   *
   * A satellite outage is evidence we FAILED TO OBSERVE: the vegetation
   * existed, we just could not see it, so the gap is filled conservatively.
   *
   * No prior credit is different. It is not a gap in our observation, it is
   * the ordinary state of most smallholders — the very people this product
   * exists to reach. Treating it as missing evidence would dock the score of
   * a farmer who has never borrowed, and could leave them scoring below one
   * with a documented history of paying late. So this weight is redistributed
   * across the signals we do have, and confidence is not reduced for it.
   */
  const expected =
    features.priorRepaymentRate === null
      ? withoutKey(FINANCIAL_BEHAVIOUR_WEIGHTS, 'priorRepayment')
      : FINANCIAL_BEHAVIOUR_WEIGHTS;

  return combine(parts, expected);
}

/** A copy of a weight map with one entry dropped. */
function withoutKey(
  weights: Record<string, number>,
  key: string,
): Record<string, number> {
  const copy: Record<string, number> = {};
  for (const [name, weight] of Object.entries(weights)) {
    if (name !== key) copy[name] = weight;
  }
  return copy;
}

// ===========================================================================
// Confidence
// ===========================================================================

function assessConfidence(
  bundle: FeatureBundle,
  productivity: FamilyScore,
  climate: FamilyScore,
  financial: FamilyScore,
): ScoreConfidence {
  const reasons: string[] = [];

  /*
   * Each family already knows how much of its own weight was informed and how
   * well evidenced each of those signals was, so evidence is just the
   * weighted roll-up. A signal that arrived but was thin counts for less than
   * one backed by twenty seasons of history, and one that never arrived
   * counts for nothing.
   */
  const evidence = clamp(
    weightedMean([
      {
        weight: FAMILY_WEIGHTS.farmProductivity,
        value: productivity.evidence,
      },
      { weight: FAMILY_WEIGHTS.climateRisk, value: climate.evidence },
      {
        weight: FAMILY_WEIGHTS.financialBehaviour,
        value: financial.evidence,
      },
    ]),
    0,
    1,
  );

  if (!bundle.satellite.features) {
    reasons.push('No satellite imagery was available for this farm.');
  }
  if (!bundle.weather.features) {
    reasons.push('No rainfall history was available for this location.');
  }
  if (!bundle.mobileMoney.features) {
    reasons.push('No mobile-money history could be linked for this farmer.');
  }

  for (const result of [bundle.satellite, bundle.weather, bundle.mobileMoney]) {
    if (result.quality === 'partial') {
      reasons.push(...result.notes);
    }
  }

  const level: ConfidenceLevel =
    evidence >= CONFIDENCE_BANDS.high
      ? 'high'
      : evidence >= CONFIDENCE_BANDS.medium
        ? 'medium'
        : 'low';

  if (level !== 'high' && reasons.length === 0) {
    reasons.push('Some inputs were thinner than the model expects.');
  }

  return { level, evidence: roundTo(evidence, 3), reasons };
}

/**
 * A source that reported completeness 0.5 is not half worthless — it is a
 * real reading with less behind it. Blending toward 1 stops a merely thin
 * signal collapsing confidence the way a missing one does.
 */
function blend(completeness: number): number {
  return 0.4 + 0.6 * clamp(completeness, 0, 1);
}

/**
 * Pulls the score toward the thin-file anchor as evidence thins — but only
 * ever downward. A weak file is never lifted by the fact that we know little
 * about it; a strong one is discounted until it is properly evidenced.
 */
export function applyThinFileShrinkage(
  raw01: number,
  evidence: number,
): number {
  const e = clamp(evidence, 0, 1);
  const anchor = Math.min(raw01, THIN_FILE_ANCHOR);
  return clamp(e * raw01 + (1 - e) * anchor, 0, 1);
}

// ===========================================================================
// Risk and terms
// ===========================================================================

/**
 * Exponential interpolation between the two documented endpoints. Monotone
 * decreasing in the score, and never outside [PD_AT_BEST, PD_AT_WORST].
 */
export function defaultProbabilityFor(adjusted01: number): number {
  const x = clamp(adjusted01, 0, 1);
  return PD_AT_WORST * (PD_AT_BEST / PD_AT_WORST) ** x;
}

export function bandFor(pd: number): { band: RiskBand; label: string } {
  for (const entry of RISK_BANDS) {
    if (pd <= entry.maxPd) return { band: entry.band, label: entry.label };
  }
  const last = RISK_BANDS[RISK_BANDS.length - 1]!;
  return { band: last.band, label: last.label };
}

function recommendTerms(
  bundle: FeatureBundle,
  band: RiskBand,
  confidence: ScoreConfidence,
  missingFamilyCount: number,
  warnings: string[],
): RecommendedTerms | null {
  const crop = bundle.context.primaryCrop;
  const termMonths = TERM_MONTHS_BY_CROP[crop] ?? DEFAULT_TERM_MONTHS;

  // A whole family of signals missing caps the offer regardless of the score,
  // so there is little to gain by withholding the weakest evidence.
  const exposure =
    missingFamilyCount > 0
      ? Math.min(
          BAND_EXPOSURE_MULTIPLIER[band],
          MISSING_FAMILY_EXPOSURE_CAP,
        )
      : BAND_EXPOSURE_MULTIPLIER[band];

  if (exposure === 0) {
    warnings.push(
      'Risk is too high for an automatic recommendation. Any offer here is a ' +
        'manual underwriting decision.',
    );
    return null;
  }

  if (confidence.evidence < MIN_EVIDENCE_FOR_TERMS) {
    warnings.push(
      'Too little evidence to recommend terms. Gather more before offering ' +
        'an amount.',
    );
    return null;
  }

  // Ceiling one: what the farm can absorb for a cycle of inputs.
  const inputCost = INPUT_COST_PER_HA_KES[crop] ?? INPUT_COST_PER_HA_KES['other']!;
  const farmCeiling = bundle.context.farmSizeHa * inputCost * 1.2;

  // Ceiling two: what the borrower's income could service over the term.
  const money = bundle.mobileMoney.features;
  const incomeCeiling =
    money === null
      ? null
      : money.medianMonthlyInflowKes * MAX_DEBT_SERVICE_RATIO * termMonths;

  const base =
    incomeCeiling === null
      ? farmCeiling * NO_INCOME_SIGNAL_MULTIPLIER
      : Math.min(farmCeiling, incomeCeiling);

  const amountKes =
    Math.floor((base * exposure) / AMOUNT_ROUNDING_KES) * AMOUNT_ROUNDING_KES;

  if (amountKes < MIN_RECOMMENDED_AMOUNT_KES) {
    warnings.push(
      'The supportable amount falls below a useful loan size, so no terms ' +
        'are recommended.',
    );
    return null;
  }

  const basis =
    incomeCeiling === null
      ? `Farm inputs for ${bundle.context.farmSizeHa} ha of ${crop}, halved because no income signal was available, then scaled for ${band.replace('-', ' ')} risk.`
      : incomeCeiling < farmCeiling
        ? `Limited by repayment capacity: ${Math.round(MAX_DEBT_SERVICE_RATIO * 100)}% of median monthly income over ${termMonths} months, scaled for ${band.replace('-', ' ')} risk.`
        : `Limited by what the farm can absorb: inputs for ${bundle.context.farmSizeHa} ha of ${crop}, scaled for ${band.replace('-', ' ')} risk.`;

  const cappedNote =
    missingFamilyCount > 0
      ? ' Capped because a whole signal family was missing.'
      : '';

  /*
   * A deliberate, and arguable, policy choice, surfaced rather than buried.
   *
   * With no income signal the recommendation rests on one ceiling instead of
   * two: what the farm can absorb, halved. That is how input-secured lending
   * works, and refusing outright would exclude exactly the farmers with no
   * linkable mobile-money history that this product exists to reach.
   *
   * The cost is an incentive: an applicant with genuinely poor income could
   * fare better by not linking their account than by linking it. The exposure
   * cap above blunts that, but does not remove it. So the officer is told
   * plainly that the offer is farm-secured and unverified against income, and
   * the lender decides. Set NO_INCOME_SIGNAL_MULTIPLIER to 0 to refuse these
   * outright instead.
   */
  if (incomeCeiling === null) {
    warnings.push(
      'This amount is not backed by any income evidence. It is sized to what ' +
        'the farm can absorb, halved, and should be treated as farm-secured ' +
        'lending rather than as an assessed repayment capacity.',
    );
  }

  return { amountKes, termMonths, basis: basis + cappedNote };
}

// ===========================================================================
// Helpers
// ===========================================================================

interface WeightedPart {
  key: string;
  weight: number;
  value: number;
  /**
   * How well evidenced this particular signal is, 0 to 1. Signals taken from
   * the intake form are 1: the officer measured the farm, so there is no
   * upstream source to be thin. Adapter-derived signals carry their source's
   * completeness.
   */
  completeness: number;
}

/**
 * Renormalises whichever parts are present over the family's full weight map,
 * and reports what share of that map was informed.
 */
function combine(
  parts: WeightedPart[],
  allWeights: Record<string, number>,
): FamilyScore {
  if (parts.length === 0) return { value: null, coverage: 0, evidence: 0 };

  const totalPossible = Object.values(allWeights).reduce((a, b) => a + b, 0);
  const covered = parts.reduce((sum, part) => sum + part.weight, 0);
  const evidenced = parts.reduce(
    (sum, part) => sum + part.weight * clamp(part.completeness, 0, 1),
    0,
  );

  const presentMean = weightedMean(parts);

  /*
   * The same substitution rule as across families, applied within one.
   *
   * Renormalising over only the present signals would let a farm with no
   * satellite view be judged on its size alone, and a large plot would then
   * look like a productive one. Whatever weight went uninformed is filled at
   * no better than the conservative anchor instead.
   */
  const uncovered = totalPossible - covered;
  const value =
    uncovered <= 1e-9
      ? presentMean
      : (covered * presentMean +
          uncovered * Math.min(presentMean, THIN_FILE_ANCHOR)) /
        totalPossible;

  return {
    value,
    coverage: totalPossible === 0 ? 0 : clamp(covered / totalPossible, 0, 1),
    evidence: totalPossible === 0 ? 0 : clamp(evidenced / totalPossible, 0, 1),
  };
}

function weightedMean(
  parts: ReadonlyArray<{ weight: number; value: number }>,
): number {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return 0;
  return parts.reduce((sum, part) => sum + part.weight * part.value, 0) / totalWeight;
}

/**
 * Maps a raw value onto 0 to 1 against its anchors, clamping outside them.
 * Handles inverted anchors, where a lower raw value is the better one.
 */
export function normalise(
  value: number,
  anchor: { low: number; high: number },
): number {
  if (anchor.high === anchor.low) return 0.5;
  return clamp((value - anchor.low) / (anchor.high - anchor.low), 0, 1);
}

function factorFor(input: {
  key: string;
  label: string;
  family: SignalFamily;
  normalised: number;
  weight: number;
  explanation: string;
}): ScoreFactor {
  // Contribution is measured against a neutral reading of the same signal, so
  // the numbers in the explanation panel add up rather than merely rank.
  const contribution = Math.round(
    (input.normalised - 0.5) * input.weight * (SCORE_MAX - SCORE_MIN),
  );

  return {
    key: input.key,
    label: input.label,
    family: input.family,
    direction:
      contribution > 0 ? 'positive' : contribution < 0 ? 'negative' : 'neutral',
    contribution,
    normalised: roundTo(input.normalised, 3),
    explanation: input.explanation,
    available: true,
  };
}

function missingFactor(input: {
  key: string;
  label: string;
  family: SignalFamily;
  explanation: string;
}): ScoreFactor {
  return {
    key: input.key,
    label: input.label,
    family: input.family,
    direction: 'neutral',
    contribution: 0,
    normalised: null,
    explanation: input.explanation,
    available: false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export { FAMILY_LABELS };
