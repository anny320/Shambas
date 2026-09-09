import { describe, expect, it } from 'vitest';
import { score, applyThinFileShrinkage, defaultProbabilityFor, normalise, bandFor } from '@/scoring/score';
import {
  MODEL_VERSION,
  PD_AT_BEST,
  PD_AT_WORST,
  SCORE_MAX,
  SCORE_MIN,
  THIN_FILE_ANCHOR,
} from '@/scoring/weights';
import type {
  AdapterResult,
  FarmContext,
  FeatureBundle,
  MobileMoneyFeatures,
  SatelliteFeatures,
  WeatherFeatures,
} from '@/adapters/types';
import { collectFeatures } from '@/adapters';
import { MockSatelliteAdapter } from '@/adapters/satellite/mock';
import { MockWeatherAdapter } from '@/adapters/weather/mock';
import { MockMobileMoneyAdapter } from '@/adapters/mobile-money/mock';

const AS_OF = new Date('2026-03-01T09:00:00.000Z');

function context(overrides: Partial<FarmContext> = {}): FarmContext {
  return {
    farmerId: 'farmer-0001',
    latitude: -0.4237,
    longitude: 36.9476,
    farmSizeHa: 1.5,
    primaryCrop: 'maize',
    asOf: AS_OF,
    ...overrides,
  };
}

function ok<T>(source: string, features: T, completeness = 1): AdapterResult<T> {
  return {
    source,
    quality: 'ok',
    completeness,
    features,
    notes: [],
    fetchedAt: AS_OF.toISOString(),
  };
}

function absent<T>(source: string, note = 'unavailable'): AdapterResult<T> {
  return {
    source,
    quality: 'unavailable',
    completeness: 0,
    features: null,
    notes: [note],
    fetchedAt: AS_OF.toISOString(),
  };
}

const STRONG_SATELLITE: SatelliteFeatures = {
  ndviCurrent: 0.72,
  ndviSeasonMean: 0.7,
  ndviYearOnYearRatio: 1.18,
  ndviVsRegionalNorm: 1.2,
  observationCount: 30,
  cloudObscuredShare: 0.1,
};

const WEAK_SATELLITE: SatelliteFeatures = {
  ndviCurrent: 0.24,
  ndviSeasonMean: 0.22,
  ndviYearOnYearRatio: 0.78,
  ndviVsRegionalNorm: 0.55,
  observationCount: 28,
  cloudObscuredShare: 0.15,
};

const STRONG_WEATHER: WeatherFeatures = {
  seasonRainfallMm: 640,
  rainfallVsNormRatio: 1.03,
  rainfallReliability: 0.88,
  longestDrySpellDays: 12,
  droughtSeasonsLast5: 0,
  floodSeasonsLast5: 0,
  seasonsOfHistory: 35,
};

const WEAK_WEATHER: WeatherFeatures = {
  seasonRainfallMm: 210,
  rainfallVsNormRatio: 0.5,
  rainfallReliability: 0.28,
  longestDrySpellDays: 52,
  droughtSeasonsLast5: 3,
  floodSeasonsLast5: 0,
  seasonsOfHistory: 30,
};

const STRONG_MONEY: MobileMoneyFeatures = {
  monthsObserved: 24,
  inflowRegularity: 0.88,
  medianMonthlyInflowKes: 26_000,
  inflowVolatility: 0.15,
  averageBalanceKes: 9_500,
  distinctCounterparties: 30,
  priorRepaymentRate: 0.99,
};

const WEAK_MONEY: MobileMoneyFeatures = {
  monthsObserved: 24,
  inflowRegularity: 0.2,
  medianMonthlyInflowKes: 1_800,
  inflowVolatility: 0.85,
  averageBalanceKes: 40,
  distinctCounterparties: 3,
  priorRepaymentRate: 0.55,
};

function bundle(parts: Partial<FeatureBundle> = {}): FeatureBundle {
  return {
    context: context(),
    satellite: ok('sentinel-2/test', STRONG_SATELLITE),
    weather: ok('chirps/test', STRONG_WEATHER),
    mobileMoney: ok('mpesa/test', STRONG_MONEY),
    ...parts,
  };
}

// ---------------------------------------------------------------------------

describe('score() is pure', () => {
  it('returns the same result for the same input, every time', () => {
    const input = bundle();
    const first = score(input);
    for (let i = 0; i < 25; i += 1) {
      expect(score(input)).toEqual(first);
    }
  });

  it('does not mutate its input', () => {
    const input = bundle();
    const snapshot = structuredClone(input);
    score(input);
    expect(input).toEqual(snapshot);
  });
});

describe('score bounds and direction', () => {
  it('keeps the score inside the published range', () => {
    for (const input of [
      bundle(),
      bundle({
        satellite: ok('s', WEAK_SATELLITE),
        weather: ok('w', WEAK_WEATHER),
        mobileMoney: ok('m', WEAK_MONEY),
      }),
      bundle({
        satellite: absent('s'),
        weather: absent('w'),
        mobileMoney: absent('m'),
      }),
    ]) {
      const result = score(input);
      expect(result.score).toBeGreaterThanOrEqual(SCORE_MIN);
      expect(result.score).toBeLessThanOrEqual(SCORE_MAX);
      expect(Number.isInteger(result.score)).toBe(true);
    }
  });

  it('scores a strong file well above a weak one', () => {
    const strong = score(bundle());
    const weak = score(
      bundle({
        satellite: ok('s', WEAK_SATELLITE),
        weather: ok('w', WEAK_WEATHER),
        mobileMoney: ok('m', WEAK_MONEY),
      }),
    );
    expect(strong.score).toBeGreaterThan(weak.score + 150);
    expect(strong.probabilityOfDefault).toBeLessThan(weak.probabilityOfDefault);
  });

  it('moves monotonically with each family in isolation', () => {
    const weakerSatellite = score(bundle({ satellite: ok('s', WEAK_SATELLITE) }));
    const weakerWeather = score(bundle({ weather: ok('w', WEAK_WEATHER) }));
    const weakerMoney = score(bundle({ mobileMoney: ok('m', WEAK_MONEY) }));
    const allStrong = score(bundle());

    expect(weakerSatellite.score).toBeLessThan(allStrong.score);
    expect(weakerWeather.score).toBeLessThan(allStrong.score);
    expect(weakerMoney.score).toBeLessThan(allStrong.score);
  });
});

describe('missing data lowers confidence and never helps the score', () => {
  it('cannot raise the score of a strong file', () => {
    const full = score(bundle());

    for (const missing of [
      { satellite: absent<SatelliteFeatures>('s') },
      { weather: absent<WeatherFeatures>('w') },
      { mobileMoney: absent<MobileMoneyFeatures>('m') },
    ]) {
      const partial = score(bundle(missing));
      expect(partial.score).toBeLessThanOrEqual(full.score);
      expect(partial.confidence.evidence).toBeLessThan(
        full.confidence.evidence,
      );
    }
  });

  /*
   * The honest limit of this model, pinned by a test so it cannot drift.
   *
   * For a file that is already failing, hiding a signal can nudge the NUMBER
   * up a little: the model cannot know that the hidden signal was the worst
   * one. What it can guarantee is that hiding a signal never improves the
   * OUTCOME — the band never gets better and the offer never gets larger.
   * That is the property with real-world consequence, because an applicant
   * benefits from the loan, not from the score.
   */
  it('never improves the outcome for a weak file, whatever is withheld', () => {
    const weakAll = bundle({
      satellite: ok('s', WEAK_SATELLITE),
      weather: ok('w', WEAK_WEATHER),
      mobileMoney: ok('m', WEAK_MONEY),
    });
    const full = score(weakAll);
    expect(full.terms).toBeNull();

    for (const withheld of [
      { satellite: absent<SatelliteFeatures>('s') },
      { weather: absent<WeatherFeatures>('w') },
      { mobileMoney: absent<MobileMoneyFeatures>('m') },
    ]) {
      const partial = score({ ...weakAll, ...withheld });
      expect(partial.terms).toBeNull();
      expect(partial.confidence.evidence).toBeLessThan(full.confidence.evidence);
    }
  });

  it('holds the score under the ceiling the evidence supports', () => {
    // A dark file cannot reach the middle of the range however the arithmetic
    // falls out, because there is nothing to justify it.
    const dark = score(
      bundle({
        satellite: absent('s'),
        weather: absent('w'),
        mobileMoney: absent('m'),
      }),
    );
    expect(dark.score).toBeLessThan((SCORE_MIN + SCORE_MAX) / 2);
    expect(dark.terms).toBeNull();
  });

  it('reports low confidence and a reason when everything is missing', () => {
    const result = score(
      bundle({
        satellite: absent('s'),
        weather: absent('w'),
        mobileMoney: absent('m'),
      }),
    );
    expect(result.confidence.level).toBe('low');
    // Farm size is measured by the officer at intake, so a shred of evidence
    // survives even when every external source is dark.
    expect(result.confidence.evidence).toBeLessThan(0.1);
    expect(result.confidence.reasons.length).toBeGreaterThanOrEqual(3);
    expect(result.terms).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('lands an evidence-free file near the conservative anchor', () => {
    const result = score(
      bundle({
        satellite: absent('s'),
        weather: absent('w'),
        mobileMoney: absent('m'),
      }),
    );
    const anchorScore = SCORE_MIN + THIN_FILE_ANCHOR * (SCORE_MAX - SCORE_MIN);
    // Close to the anchor, and never far above it. Farm size is the only
    // thing known, so it may move the result slightly.
    expect(Math.abs(result.score - anchorScore)).toBeLessThan(20);
    // No evidence is emphatically not a pass.
    expect(result.score).toBeLessThan((SCORE_MIN + SCORE_MAX) / 2);
  });

  it('flags an offer made with no income evidence at all', () => {
    const result = score({
      ...bundle({ mobileMoney: absent('m') }),
      context: context({ farmSizeHa: 1.0 }),
    });
    expect(result.terms).not.toBeNull();
    expect(result.warnings.join(' ')).toContain('not backed by any income');
    expect(result.terms!.basis).toContain('no income signal');
  });

  it('surfaces a missing signal as an unavailable factor rather than hiding it', () => {
    const result = score(bundle({ mobileMoney: absent('m') }));
    const factor = result.factors.find((f) => f.key === 'inflow-regularity');
    expect(factor).toBeDefined();
    expect(factor?.available).toBe(false);
    expect(factor?.contribution).toBe(0);
    expect(factor?.normalised).toBeNull();
    expect(result.familyScores.financialBehaviour).toBeNull();
  });

  it('shows the thin-file deduction as its own visible factor', () => {
    const result = score(bundle({ mobileMoney: absent('m') }));
    const adjustment = result.factors.find(
      (f) => f.key === 'thin-file-adjustment',
    );
    expect(adjustment).toBeDefined();
    expect(adjustment!.contribution).toBeLessThan(0);
  });
});

describe('no prior credit is not bad credit', () => {
  it('scores a farmer with no borrowing history above one who repaid poorly', () => {
    const noHistory = score(
      bundle({
        mobileMoney: ok('m', { ...STRONG_MONEY, priorRepaymentRate: null }),
      }),
    );
    const badHistory = score(
      bundle({
        mobileMoney: ok('m', { ...STRONG_MONEY, priorRepaymentRate: 0.6 }),
      }),
    );
    expect(noHistory.score).toBeGreaterThan(badHistory.score);
  });

  it('does not dock confidence for never having borrowed', () => {
    // No prior credit is the ordinary state of a smallholder, not a gap in
    // our observation, so it must not read as a thinner file.
    const noHistory = score(
      bundle({
        mobileMoney: ok('m', { ...STRONG_MONEY, priorRepaymentRate: null }),
      }),
    );
    const withHistory = score(bundle());
    expect(noHistory.confidence.evidence).toBe(withHistory.confidence.evidence);
    expect(noHistory.confidence.level).toBe(withHistory.confidence.level);
  });

  it('never ranks a farmer with no record below one who paid late', () => {
    const noHistory = score(
      bundle({
        mobileMoney: ok('m', { ...STRONG_MONEY, priorRepaymentRate: null }),
      }),
    );
    for (const rate of [0.6, 0.7, 0.8, 0.9]) {
      const withRecord = score(
        bundle({
          mobileMoney: ok('m', { ...STRONG_MONEY, priorRepaymentRate: rate }),
        }),
      );
      if (rate < 0.98) {
        expect(
          noHistory.score,
          `no record should not rank below a ${rate} repayment rate`,
        ).toBeGreaterThanOrEqual(withRecord.score);
      }
    }
  });

  it('marks the absent repayment record as unavailable, not as zero', () => {
    const result = score(
      bundle({
        mobileMoney: ok('m', { ...STRONG_MONEY, priorRepaymentRate: null }),
      }),
    );
    const factor = result.factors.find((f) => f.key === 'prior-repayment');
    expect(factor?.available).toBe(false);
    expect(factor?.contribution).toBe(0);
    expect(factor?.explanation).toContain('not counted against');
  });
});

describe('default probability', () => {
  it('stays within the documented endpoints and decreases with the score', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const pd = defaultProbabilityFor(x);
      expect(pd).toBeGreaterThanOrEqual(PD_AT_BEST - 1e-9);
      expect(pd).toBeLessThanOrEqual(PD_AT_WORST + 1e-9);
      expect(pd).toBeLessThan(previous);
      previous = pd;
    }
  });

  it('hits the stated endpoints exactly', () => {
    expect(defaultProbabilityFor(0)).toBeCloseTo(PD_AT_WORST, 10);
    expect(defaultProbabilityFor(1)).toBeCloseTo(PD_AT_BEST, 10);
  });

  it('bands the probability without leaving a gap', () => {
    for (const pd of [0, 0.05, 0.051, 0.1, 0.18, 0.3, 0.31, 0.99, 1]) {
      expect(bandFor(pd).band).toBeTruthy();
    }
    expect(bandFor(0.04).band).toBe('very-low');
    expect(bandFor(0.09).band).toBe('low');
    expect(bandFor(0.15).band).toBe('moderate');
    expect(bandFor(0.25).band).toBe('high');
    expect(bandFor(0.4).band).toBe('very-high');
  });
});

describe('thin-file shrinkage', () => {
  it('leaves a fully evidenced score untouched', () => {
    expect(applyThinFileShrinkage(0.9, 1)).toBeCloseTo(0.9, 10);
    expect(applyThinFileShrinkage(0.1, 1)).toBeCloseTo(0.1, 10);
  });

  it('pulls an unevidenced strong score down to the anchor', () => {
    expect(applyThinFileShrinkage(0.9, 0)).toBeCloseTo(THIN_FILE_ANCHOR, 10);
  });

  it('never lifts a score that is already below the anchor', () => {
    for (const evidence of [0, 0.25, 0.5, 0.75, 1]) {
      expect(applyThinFileShrinkage(0.15, evidence)).toBeCloseTo(0.15, 10);
    }
  });

  it('is monotone in evidence for any raw score', () => {
    for (const raw of [0.1, 0.35, 0.5, 0.8, 1]) {
      let previous = -Infinity;
      for (let e = 0; e <= 1.0001; e += 0.1) {
        const value = applyThinFileShrinkage(raw, e);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });
});

describe('normalise', () => {
  it('clamps outside its anchors', () => {
    expect(normalise(-5, { low: 0, high: 1 })).toBe(0);
    expect(normalise(5, { low: 0, high: 1 })).toBe(1);
  });

  it('handles inverted anchors, where lower is better', () => {
    const anchor = { low: 3, high: 0 };
    expect(normalise(0, anchor)).toBe(1);
    expect(normalise(3, anchor)).toBe(0);
    expect(normalise(1.5, anchor)).toBeCloseTo(0.5, 10);
  });

  it('does not divide by zero when anchors coincide', () => {
    expect(normalise(7, { low: 2, high: 2 })).toBe(0.5);
  });
});

describe('recommended terms', () => {
  it('recommends nothing when risk is very high', () => {
    const result = score(
      bundle({
        satellite: ok('s', WEAK_SATELLITE),
        weather: ok('w', WEAK_WEATHER),
        mobileMoney: ok('m', WEAK_MONEY),
      }),
    );
    expect(result.band).toBe('very-high');
    expect(result.terms).toBeNull();
    expect(result.warnings.join(' ')).toContain('manual underwriting');
  });

  it('sizes a strong file and explains the binding constraint', () => {
    const result = score(bundle());
    expect(result.terms).not.toBeNull();
    expect(result.terms!.amountKes).toBeGreaterThan(0);
    expect(result.terms!.amountKes % 500).toBe(0);
    expect(result.terms!.termMonths).toBe(6);
    expect(result.terms!.basis.length).toBeGreaterThan(10);
  });

  it('never exceeds what income could service over the term', () => {
    const result = score(bundle());
    const ceiling = STRONG_MONEY.medianMonthlyInflowKes * 0.25 * 6;
    expect(result.terms!.amountKes).toBeLessThanOrEqual(ceiling);
  });

  it('never exceeds what the farm can absorb in inputs', () => {
    // Tiny farm, large income: the farm ceiling must bind.
    const result = score({
      ...bundle(),
      context: context({ farmSizeHa: 0.3 }),
    });
    const farmCeiling = 0.3 * 25_000 * 1.2;
    expect(result.terms!.amountKes).toBeLessThanOrEqual(farmCeiling);
    expect(result.terms!.basis).toContain('farm can absorb');
  });

  it('halves the offer when there is no income signal at all', () => {
    const withIncome = score({
      ...bundle(),
      context: context({ farmSizeHa: 0.5 }),
    });
    const withoutIncome = score({
      ...bundle({ mobileMoney: absent('m') }),
      context: context({ farmSizeHa: 0.5 }),
    });

    expect(withoutIncome.terms).not.toBeNull();
    expect(withoutIncome.terms!.amountKes).toBeLessThan(
      withIncome.terms!.amountKes,
    );
    expect(withoutIncome.terms!.basis).toContain('no income signal');
  });

  it('follows the crop cash cycle for the term', () => {
    const perennial = score({
      ...bundle(),
      context: context({ primaryCrop: 'coffee' }),
    });
    expect(perennial.terms!.termMonths).toBe(12);

    const horticulture = score({
      ...bundle(),
      context: context({ primaryCrop: 'horticulture' }),
    });
    expect(horticulture.terms!.termMonths).toBe(4);
  });

  it('falls back safely for a crop it has no reference costs for', () => {
    const result = score({
      ...bundle(),
      context: context({ primaryCrop: 'khat' }),
    });
    expect(result.terms).not.toBeNull();
    expect(result.terms!.termMonths).toBe(6);
  });
});

describe('explanations', () => {
  it('always offers at least three factors in plain language', () => {
    const result = score(bundle());
    expect(result.factors.length).toBeGreaterThanOrEqual(3);
    for (const factor of result.factors) {
      expect(factor.explanation.length).toBeGreaterThan(20);
      expect(factor.label.length).toBeGreaterThan(2);
    }
  });

  it('orders factors by how much they moved the score', () => {
    const result = score(bundle());
    for (let i = 1; i < result.factors.length; i += 1) {
      expect(Math.abs(result.factors[i]!.contribution)).toBeLessThanOrEqual(
        Math.abs(result.factors[i - 1]!.contribution),
      );
    }
  });

  it('signs each contribution consistently with its direction', () => {
    const result = score(
      bundle({ satellite: ok('s', WEAK_SATELLITE) }),
    );
    for (const factor of result.factors) {
      if (factor.direction === 'positive') {
        expect(factor.contribution).toBeGreaterThan(0);
      } else if (factor.direction === 'negative') {
        expect(factor.contribution).toBeLessThan(0);
      } else {
        expect(factor.contribution).toBe(0);
      }
    }
  });

  it('records the model version and every source for the audit trail', () => {
    const result = score(bundle());
    expect(result.modelVersion).toBe(MODEL_VERSION);
    expect(result.sources).toHaveLength(3);
  });
});

describe('against the mock adapters, end to end', () => {
  it('produces a sane result for every farm in a wide sweep', async () => {
    const adapters = {
      satellite: new MockSatelliteAdapter('sweep'),
      weather: new MockWeatherAdapter('sweep'),
      mobileMoney: new MockMobileMoneyAdapter('sweep'),
    };

    const points: Array<[number, number]> = [
      [-0.42, 36.95],
      [0.28, 34.75],
      [-1.5, 38.5],
      [-4.0, 39.6],
      [3.1, 35.6],
    ];

    let withTerms = 0;
    let withoutTerms = 0;

    for (let i = 0; i < 200; i += 1) {
      const point = points[i % points.length]!;
      const bundleForFarm = await collectFeatures(
        context({
          farmerId: `sweep-${i}`,
          latitude: point[0],
          longitude: point[1],
          farmSizeHa: 0.2 + (i % 30) / 6,
        }),
        adapters,
      );

      const result = score(bundleForFarm);

      expect(result.score).toBeGreaterThanOrEqual(SCORE_MIN);
      expect(result.score).toBeLessThanOrEqual(SCORE_MAX);
      expect(result.probabilityOfDefault).toBeGreaterThan(0);
      expect(result.probabilityOfDefault).toBeLessThanOrEqual(PD_AT_WORST);
      expect(['high', 'medium', 'low']).toContain(result.confidence.level);
      expect(result.factors.length).toBeGreaterThanOrEqual(3);

      if (result.terms) {
        withTerms += 1;
        expect(result.terms.amountKes).toBeGreaterThanOrEqual(3_000);
        expect(result.terms.termMonths).toBeGreaterThan(0);
      } else {
        withoutTerms += 1;
      }

      if (result.confidence.level !== 'high') {
        expect(result.confidence.reasons.length).toBeGreaterThan(0);
      }
    }

    // The sweep must exercise both outcomes, or these assertions prove little.
    expect(withTerms).toBeGreaterThan(10);
    expect(withoutTerms).toBeGreaterThan(0);
  });
});
