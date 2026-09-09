import type { FeatureBundle } from '@/adapters/types';
import type { RiskBand, SignalFamily } from '@/scoring/weights';

export type { RiskBand, SignalFamily };

export type FactorDirection = 'positive' | 'negative' | 'neutral';

/**
 * One signal's contribution to the score, in plain language.
 *
 * `contribution` is in score points, signed, relative to a neutral reading of
 * that signal. It is what makes the explanation add up rather than merely
 * sound plausible.
 */
export interface ScoreFactor {
  key: string;
  label: string;
  family: SignalFamily;
  direction: FactorDirection;
  /** Signed score points contributed, relative to neutral. */
  contribution: number;
  /** The normalised 0-to-1 reading of this signal, or null when absent. */
  normalised: number | null;
  /** What the officer should understand from this, in one sentence. */
  explanation: string;
  /** False when the underlying data was missing. */
  available: boolean;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ScoreConfidence {
  level: ConfidenceLevel;
  /** Share of the evidence the model expected that it actually got, 0 to 1. */
  evidence: number;
  /** Why confidence is where it is. Always populated when it is not high. */
  reasons: string[];
}

export interface RecommendedTerms {
  amountKes: number;
  termMonths: number;
  /** How the ceiling was arrived at, for the officer and for the audit trail. */
  basis: string;
}

export interface ScoreResult {
  /** 300 to 850. */
  score: number;
  band: RiskBand;
  bandLabel: string;
  /** Estimated probability of default over the loan term, 0 to 1. */
  probabilityOfDefault: number;
  confidence: ScoreConfidence;
  /**
   * Null when the evidence is too thin, or the risk too high, to recommend
   * terms. Null means "decide this by hand", not "decline".
   */
  terms: RecommendedTerms | null;
  /** Every signal considered, strongest contribution first. */
  factors: ScoreFactor[];
  /** Family sub-scores, 0 to 1, or null where the family had no data. */
  familyScores: Record<SignalFamily, number | null>;
  modelVersion: string;
  /** Which adapter produced each signal, for the audit trail. */
  sources: string[];
  /** Warnings the officer must see, e.g. that a signal was missing. */
  warnings: string[];
}

export type ScoreInput = FeatureBundle;
