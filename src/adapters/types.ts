/**
 * The data-adapter contract.
 *
 * Every external signal — satellite, weather, mobile money — arrives through
 * one of these. Two rules make the whole design work:
 *
 *  1. An adapter returns NORMALISED features, never raw API payloads. The
 *     scoring engine never learns what a Sentinel-2 scene or a Daraja
 *     statement looks like.
 *
 *  2. An adapter NEVER invents a value to fill a gap. When data is missing or
 *     thin it says so, through `quality` and `completeness`, and the score
 *     that follows carries lower confidence. Silently imputing a missing
 *     signal as an average — let alone a good one — would quietly turn "we
 *     don't know" into "this farmer is fine", which is the single most
 *     dangerous thing a thin-file credit tool can do.
 */

/** What the officer told us about the farm, plus when we are asking. */
export interface FarmContext {
  /** Stable id used to seed the mock adapters, so a farm scores the same twice. */
  farmerId: string;
  latitude: number;
  longitude: number;
  farmSizeHa: number;
  primaryCrop: string;
  /** The moment the assessment is made. Injected so tests are deterministic. */
  asOf: Date;
}

/**
 * How much of a signal we actually got.
 *
 * - `ok`          usable, enough history to lean on
 * - `partial`     real but thin, stale, or noisy; usable with less weight
 * - `unavailable` nothing usable. Features are null and stay null.
 */
export type SignalQuality = 'ok' | 'partial' | 'unavailable';

export interface AdapterResult<TFeatures> {
  /** Which source produced this, e.g. 'sentinel-2/mock'. Recorded in the audit snapshot. */
  source: string;
  quality: SignalQuality;
  /**
   * How complete this signal is, from 0 to 1. Drives the confidence level on
   * the final score. `unavailable` is always 0.
   */
  completeness: number;
  /** Null whenever quality is 'unavailable'. Never a stand-in value. */
  features: TFeatures | null;
  /** Plain-language reasons, surfaced to the officer rather than swallowed. */
  notes: string[];
  fetchedAt: string;
}

export interface DataAdapter<TFeatures> {
  readonly source: string;
  readonly mode: 'mock' | 'live';
  fetch(context: FarmContext): Promise<AdapterResult<TFeatures>>;
}

// ---------------------------------------------------------------------------
// Feature shapes
// ---------------------------------------------------------------------------

/** Vegetation health over the farm, from satellite imagery. */
export interface SatelliteFeatures {
  /** Most recent NDVI over the farm, 0 to 1. Bare soil ~0.1, dense crop ~0.8. */
  ndviCurrent: number;
  /** Mean NDVI across the most recent growing season. */
  ndviSeasonMean: number;
  /**
   * Change against the same season last year, as a ratio. 1.0 is flat, 0.8 is
   * a fifth worse, 1.2 a fifth better.
   */
  ndviYearOnYearRatio: number;
  /**
   * This farm's season mean against the regional norm for the same crop and
   * area, as a ratio. This is the signal that says whether the farm is doing
   * well *for where it is*, rather than well in absolute terms.
   */
  ndviVsRegionalNorm: number;
  /** Usable satellite passes behind these numbers. Few passes means thin evidence. */
  observationCount: number;
  /** Share of passes lost to cloud, 0 to 1. */
  cloudObscuredShare: number;
}

/** Rainfall reliability and climate shocks for the farm's location. */
export interface WeatherFeatures {
  /** Rainfall over the most recent growing season, in millimetres. */
  seasonRainfallMm: number;
  /** Season rainfall against the long-run local norm, as a ratio. */
  rainfallVsNormRatio: number;
  /**
   * How dependable rainfall is here across seasons, 0 to 1. Derived from the
   * spread of historical seasonal totals: high means a farmer can plan.
   */
  rainfallReliability: number;
  /** Longest run of consecutive dry days in the season. */
  longestDrySpellDays: number;
  /** Seasons in the last five with rainfall far below norm. */
  droughtSeasonsLast5: number;
  /** Seasons in the last five with rainfall far above norm. */
  floodSeasonsLast5: number;
  /** Seasons of history behind the norms. Fewer means a shakier baseline. */
  seasonsOfHistory: number;
}

/** Financial behaviour from a consented mobile-money summary. */
export interface MobileMoneyFeatures {
  /** Months of history available. Under six months is thin. */
  monthsObserved: number;
  /** How regular inflows are, 0 to 1. Steady beats large but erratic. */
  inflowRegularity: number;
  /** Median monthly money in, in Kenyan shillings. */
  medianMonthlyInflowKes: number;
  /** Spread of monthly inflows, 0 to 1. Higher is more erratic. */
  inflowVolatility: number;
  /** Mean end-of-day balance, in Kenyan shillings. */
  averageBalanceKes: number;
  /** Distinct counterparties seen. A proxy for real economic activity. */
  distinctCounterparties: number;
  /**
   * Share of prior obligations repaid on time, 0 to 1, where any were seen.
   * Null means no prior credit was observed — which is NOT the same as bad
   * repayment, and must never be scored as though it were.
   */
  priorRepaymentRate: number | null;
}

/** Everything the adapters gathered, ready for the scoring engine. */
export interface FeatureBundle {
  context: FarmContext;
  satellite: AdapterResult<SatelliteFeatures>;
  weather: AdapterResult<WeatherFeatures>;
  mobileMoney: AdapterResult<MobileMoneyFeatures>;
}
