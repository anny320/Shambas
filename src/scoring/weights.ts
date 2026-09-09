/**
 * Expert weights and thresholds for the v1 scoring model.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE NUMBERS IN A FILE AND NOT A TRAINED MODEL
 * ---------------------------------------------------------------------------
 * At launch there is no labelled repayment data, so there is nothing to train
 * on. A model fitted to zero defaults would be a black box that had learnt
 * nothing. v1 is therefore a transparent expert model: every weight below is
 * visible, arguable, and tunable, and every score can be traced back through
 * them to the inputs that produced it. That is what lets a loan officer
 * defend a decision to their supervisor and to a regulator.
 *
 * These are priors, not findings. They encode ordinary agricultural-lending
 * judgement — a farm doing well for its region is a better bet than one doing
 * badly; dependable rainfall matters more than one good season; steady income
 * beats large but erratic income — and they are meant to be recalibrated
 * against a pilot lender's historical repayment records as soon as any exist.
 *
 * Change them deliberately, and bump MODEL_VERSION when you do, so that
 * decisions recorded under different weights stay distinguishable in the
 * audit trail.
 */

export const MODEL_VERSION = 'expert-v1.0.0';

// ---------------------------------------------------------------------------
// Signal families
// ---------------------------------------------------------------------------

/**
 * How much each family of signals counts toward the score. Must sum to 1.
 *
 * Farm productivity leads because it is the hardest signal to fake — it comes
 * from satellite rather than from anything the applicant says — and because
 * it is the most direct read on whether this farm generates the surplus a
 * loan is repaid from.
 */
export const FAMILY_WEIGHTS = {
  farmProductivity: 0.4,
  climateRisk: 0.3,
  financialBehaviour: 0.3,
} as const;

export type SignalFamily = keyof typeof FAMILY_WEIGHTS;

export const FAMILY_LABELS: Record<SignalFamily, string> = {
  farmProductivity: 'Farm productivity',
  climateRisk: 'Climate risk',
  financialBehaviour: 'Financial behaviour',
};

/**
 * Weights within each family. Each block is renormalised over whichever
 * signals are actually present, so a missing input redistributes its weight
 * rather than scoring as zero.
 */
export const FARM_PRODUCTIVITY_WEIGHTS = {
  /** Vegetation against the regional norm: is this farm doing well *for here*? */
  ndviVsRegionalNorm: 0.5,
  /** Direction of travel against the same season last year. */
  ndviYearOnYear: 0.3,
  /** Whether the plot is large enough to generate a repayable surplus. */
  farmScale: 0.2,
} as const;

export const CLIMATE_RISK_WEIGHTS = {
  /** How dependable rainfall is here across seasons. The steadiest predictor. */
  rainfallReliability: 0.4,
  /** Drought seasons in the last five. */
  droughtHistory: 0.25,
  /** This season's rainfall against the local norm. */
  rainfallVsNorm: 0.25,
  /** Longest dry spell within the season. */
  drySpell: 0.1,
} as const;

export const FINANCIAL_BEHAVIOUR_WEIGHTS = {
  /** Regular inflow beats large, erratic inflow for servicing a loan. */
  inflowRegularity: 0.35,
  /** Absolute income, which sets what is affordable at all. */
  incomeLevel: 0.25,
  /** Prior repayment, where any exists. Absent for most smallholders. */
  priorRepayment: 0.25,
  /** Cash buffer relative to income: resilience to a bad month. */
  balanceBuffer: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Normalisation anchors
//
// Each pair says which raw value scores 0 and which scores 1. Values in
// between interpolate linearly; values outside clamp. Keeping every anchor in
// one place is what makes the model arguable rather than buried in code.
// ---------------------------------------------------------------------------

export const ANCHORS = {
  /** Vegetation at 60% of the regional norm is poor; 120% is excellent. */
  ndviVsRegionalNorm: { low: 0.6, high: 1.2 },
  /** A fifth down on last year is bad; a fifth up is good. */
  ndviYearOnYear: { low: 0.8, high: 1.2 },
  /**
   * Below about a quarter of a hectare there is little marketable surplus.
   * Above two hectares the constraint stops being land.
   */
  farmSizeHa: { low: 0.25, high: 2.0 },
  /** Rainfall reliability as reported by the weather adapter. */
  rainfallReliability: { low: 0.3, high: 0.85 },
  /**
   * Rainfall against norm is scored on distance from normal in the DRY
   * direction only; a wet season is handled by the flood signal.
   */
  rainfallVsNorm: { low: 0.55, high: 1.0 },
  /** Zero drought seasons in five is best; three or more is worst. */
  droughtSeasonsLast5: { low: 3, high: 0 },
  /** A fortnight without rain is unremarkable; six weeks is a failed season. */
  longestDrySpellDays: { low: 45, high: 14 },
  /** Inflow regularity as reported by the mobile-money adapter. */
  inflowRegularity: { low: 0.25, high: 0.85 },
  /** Median monthly inflow, in Kenyan shillings. */
  medianMonthlyInflowKes: { low: 2_000, high: 25_000 },
  /** Prior repayment rate, where any prior credit exists. */
  priorRepaymentRate: { low: 0.6, high: 0.98 },
  /** Average balance as a share of monthly inflow. */
  balanceToInflowRatio: { low: 0.03, high: 0.35 },
} as const;

// ---------------------------------------------------------------------------
// Score scale
// ---------------------------------------------------------------------------

/** Familiar credit-score range, so the number reads the way officers expect. */
export const SCORE_MIN = 300;
export const SCORE_MAX = 850;

// ---------------------------------------------------------------------------
// Thin-file handling
// ---------------------------------------------------------------------------

/**
 * Where a file with no evidence at all lands, on the 0-to-1 internal scale.
 *
 * As evidence thins, the score is pulled toward this anchor — but only ever
 * DOWNWARD (see applyThinFileShrinkage). Missing data can lower a score or
 * leave it alone. It can never raise one. Without this rule, a farmer we know
 * nothing about would score like an average farmer, and "we have no evidence"
 * would quietly become "this looks fine", which is the most dangerous thing a
 * thin-file credit tool can do.
 */
export const THIN_FILE_ANCHOR = 0.35;

/** Evidence below this is too thin to recommend terms from. */
export const MIN_EVIDENCE_FOR_TERMS = 0.35;

/**
 * Hard ceiling on the score, as a function of how much evidence there is:
 * THIN_FILE_ANCHOR + evidence * (1 - THIN_FILE_ANCHOR).
 *
 * With no evidence a file cannot score above the anchor no matter how the
 * arithmetic falls out. This is what stops a high score being manufactured by
 * withholding data, independently of the shrinkage below.
 */

/**
 * When a whole signal family is missing, no offer may draw more than this
 * share of its ceiling, whatever the score says.
 *
 * The reason is adverse selection. Without this, an applicant whose income
 * record is genuinely bad could do better by not linking it at all, and the
 * product would be teaching people to withhold their worst signal. Capping
 * the offer removes most of what there is to gain, without punishing the
 * thin-file farmers the product exists to serve — they still get a decision,
 * just a more cautious one.
 */
export const MISSING_FAMILY_EXPOSURE_CAP = 0.65;

export const CONFIDENCE_BANDS = {
  /** At or above this share of expected evidence, confidence is high. */
  high: 0.75,
  /** At or above this, medium. Below it, low. */
  medium: 0.45,
} as const;

// ---------------------------------------------------------------------------
// Default probability
//
// Mapped from the internal 0-to-1 score by exponential interpolation between
// two stated endpoints, so the curve is monotone and fully documented. These
// endpoints are priors drawn from published smallholder-portfolio experience,
// NOT measurements from our own book — we do not have one yet. Recalibrate
// against a pilot lender's history before leaning on the absolute numbers.
// ---------------------------------------------------------------------------

export const PD_AT_WORST = 0.45;
export const PD_AT_BEST = 0.03;

export const RISK_BANDS = [
  { band: 'very-low', maxPd: 0.05, label: 'Very low risk' },
  { band: 'low', maxPd: 0.1, label: 'Low risk' },
  { band: 'moderate', maxPd: 0.18, label: 'Moderate risk' },
  { band: 'high', maxPd: 0.3, label: 'High risk' },
  { band: 'very-high', maxPd: 1, label: 'Very high risk' },
] as const;

export type RiskBand = (typeof RISK_BANDS)[number]['band'];

// ---------------------------------------------------------------------------
// Loan sizing
// ---------------------------------------------------------------------------

/**
 * The largest share of monthly income we will assume is available to service
 * a loan. Deliberately conservative: smallholder income is seasonal and this
 * is a recommendation to a lender, not a promise to a farmer.
 */
export const MAX_DEBT_SERVICE_RATIO = 0.25;

/** How much of the capacity-based ceiling each risk band may actually draw. */
export const BAND_EXPOSURE_MULTIPLIER: Record<RiskBand, number> = {
  'very-low': 1.0,
  low: 0.85,
  moderate: 0.65,
  high: 0.4,
  'very-high': 0,
};

/**
 * Indicative input cost per hectare, in Kenyan shillings — seed, fertiliser
 * and crop protection for one cycle. Used as the second ceiling on a
 * recommendation, so an offer stays tied to what the farm can absorb rather
 * than only to what the borrower could service.
 *
 * Order-of-magnitude Kenyan figures. Recalibrate with the pilot institution's
 * own input pricing.
 */
export const INPUT_COST_PER_HA_KES: Record<string, number> = {
  maize: 25_000,
  beans: 20_000,
  sorghum: 15_000,
  potato: 60_000,
  tea: 45_000,
  coffee: 40_000,
  horticulture: 80_000,
  other: 25_000,
};

/** Loan term in months, following the crop's cash cycle. */
export const TERM_MONTHS_BY_CROP: Record<string, number> = {
  maize: 6,
  beans: 6,
  sorghum: 6,
  potato: 6,
  tea: 12,
  coffee: 12,
  horticulture: 4,
  other: 6,
};

export const DEFAULT_TERM_MONTHS = 6;

/**
 * Applied when there is no income signal at all, so the recommendation rests
 * on farm characteristics alone. Halved, because one of the two independent
 * ceilings is missing.
 */
export const NO_INCOME_SIGNAL_MULTIPLIER = 0.5;

/** Below this, an offer is not worth making. Recommend nothing instead. */
export const MIN_RECOMMENDED_AMOUNT_KES = 3_000;

/** Recommendations round to this, so they read like money and not like output. */
export const AMOUNT_ROUNDING_KES = 500;
