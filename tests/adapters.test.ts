import { describe, expect, it } from 'vitest';
import { collectFeatures, type AdapterSet, type FarmContext } from '@/adapters';
import { MockSatelliteAdapter } from '@/adapters/satellite/mock';
import { MockWeatherAdapter } from '@/adapters/weather/mock';
import { MockMobileMoneyAdapter } from '@/adapters/mobile-money/mock';
import { zoneFor } from '@/adapters/regions';
import type { DataAdapter } from '@/adapters/types';

const SEED = 'test-seed';
const AS_OF = new Date('2026-03-01T09:00:00.000Z');

function contextFor(overrides: Partial<FarmContext> = {}): FarmContext {
  return {
    farmerId: 'farmer-0001',
    latitude: -0.4237,
    longitude: 36.9476,
    farmSizeHa: 1.2,
    primaryCrop: 'maize',
    asOf: AS_OF,
    ...overrides,
  };
}

function mockSet(seed = SEED): AdapterSet {
  return {
    satellite: new MockSatelliteAdapter(seed),
    weather: new MockWeatherAdapter(seed),
    mobileMoney: new MockMobileMoneyAdapter(seed),
  };
}

/** Farm ids spread widely enough to exercise the unavailable branches. */
const MANY_FARMERS = Array.from({ length: 300 }, (_, i) => `farmer-${i}`);

describe('mock adapters are deterministic', () => {
  it('returns identical features for the same farm and seed', async () => {
    const first = await collectFeatures(contextFor(), mockSet());
    const second = await collectFeatures(contextFor(), mockSet());
    expect(second).toEqual(first);
  });

  it('returns different features for a different seed', async () => {
    const a = await collectFeatures(contextFor(), mockSet('seed-a'));
    const b = await collectFeatures(contextFor(), mockSet('seed-b'));
    expect(b).not.toEqual(a);
  });

  it('returns different features for a different farm', async () => {
    const a = await collectFeatures(contextFor(), mockSet());
    const b = await collectFeatures(
      contextFor({ farmerId: 'farmer-9999', latitude: -1.9, longitude: 37.8 }),
      mockSet(),
    );
    expect(b).not.toEqual(a);
  });
});

describe('adapter results stay inside their declared ranges', () => {
  it('holds for every farm across the country', async () => {
    const points: Array<[number, number]> = [
      [-0.42, 36.95], // central highlands
      [0.28, 34.75], // western
      [-1.5, 38.5], // eastern semi-arid
      [-4.0, 39.6], // coast
      [3.1, 35.6], // northern arid
    ];

    for (const farmerId of MANY_FARMERS.slice(0, 120)) {
      for (const point of points) {
        const bundle = await collectFeatures(
          contextFor({
            farmerId,
            latitude: point[0],
            longitude: point[1],
            farmSizeHa: 0.2 + (Number(farmerId.slice(7)) % 40) / 8,
          }),
          mockSet(),
        );

        const sat = bundle.satellite.features;
        if (sat) {
          expect(sat.ndviCurrent).toBeGreaterThanOrEqual(0);
          expect(sat.ndviCurrent).toBeLessThanOrEqual(1);
          expect(sat.ndviSeasonMean).toBeGreaterThanOrEqual(0);
          expect(sat.ndviSeasonMean).toBeLessThanOrEqual(1);
          expect(sat.cloudObscuredShare).toBeGreaterThanOrEqual(0);
          expect(sat.cloudObscuredShare).toBeLessThanOrEqual(1);
          expect(sat.observationCount).toBeGreaterThan(0);
          expect(Number.isInteger(sat.observationCount)).toBe(true);
          expect(sat.ndviVsRegionalNorm).toBeGreaterThan(0);
        }

        const weather = bundle.weather.features;
        if (weather) {
          expect(weather.seasonRainfallMm).toBeGreaterThan(0);
          expect(weather.rainfallReliability).toBeGreaterThanOrEqual(0);
          expect(weather.rainfallReliability).toBeLessThanOrEqual(1);
          expect(weather.droughtSeasonsLast5).toBeGreaterThanOrEqual(0);
          expect(weather.droughtSeasonsLast5).toBeLessThanOrEqual(5);
          expect(weather.floodSeasonsLast5).toBeGreaterThanOrEqual(0);
          expect(
            weather.droughtSeasonsLast5 + weather.floodSeasonsLast5,
          ).toBeLessThanOrEqual(5);
          expect(weather.longestDrySpellDays).toBeGreaterThan(0);
          expect(weather.seasonsOfHistory).toBeGreaterThan(0);
        }

        const money = bundle.mobileMoney.features;
        if (money) {
          expect(money.monthsObserved).toBeGreaterThan(0);
          expect(money.inflowRegularity).toBeGreaterThanOrEqual(0);
          expect(money.inflowRegularity).toBeLessThanOrEqual(1);
          expect(money.inflowVolatility).toBeGreaterThanOrEqual(0);
          expect(money.inflowVolatility).toBeLessThanOrEqual(1);
          expect(money.medianMonthlyInflowKes).toBeGreaterThan(0);
          expect(money.averageBalanceKes).toBeGreaterThan(0);
          if (money.priorRepaymentRate !== null) {
            expect(money.priorRepaymentRate).toBeGreaterThanOrEqual(0);
            expect(money.priorRepaymentRate).toBeLessThanOrEqual(1);
          }
        }

        for (const result of [
          bundle.satellite,
          bundle.weather,
          bundle.mobileMoney,
        ]) {
          expect(result.completeness).toBeGreaterThanOrEqual(0);
          expect(result.completeness).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('missing data is reported, never invented', () => {
  it('always pairs unavailable with null features and zero completeness', async () => {
    let unavailableSeen = 0;

    for (const farmerId of MANY_FARMERS) {
      const bundle = await collectFeatures(contextFor({ farmerId }), mockSet());
      for (const result of [
        bundle.satellite,
        bundle.weather,
        bundle.mobileMoney,
      ]) {
        if (result.quality === 'unavailable') {
          unavailableSeen += 1;
          expect(result.features).toBeNull();
          expect(result.completeness).toBe(0);
          expect(result.notes.length).toBeGreaterThan(0);
        } else {
          expect(result.features).not.toBeNull();
        }
      }
    }

    // The mocks must actually exercise the missing-data path, otherwise the
    // confidence handling downstream is never tested against real absence.
    expect(unavailableSeen).toBeGreaterThan(20);
  });

  it('explains itself whenever a signal is thin', async () => {
    for (const farmerId of MANY_FARMERS.slice(0, 100)) {
      const bundle = await collectFeatures(contextFor({ farmerId }), mockSet());
      for (const result of [
        bundle.satellite,
        bundle.weather,
        bundle.mobileMoney,
      ]) {
        if (result.quality !== 'ok') {
          expect(
            result.notes.length,
            `${result.source} was ${result.quality} with no explanation`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('reports no prior credit as null rather than as a zero repayment rate', async () => {
    let nullsSeen = 0;
    for (const farmerId of MANY_FARMERS) {
      const bundle = await collectFeatures(contextFor({ farmerId }), mockSet());
      const money = bundle.mobileMoney.features;
      if (money && money.priorRepaymentRate === null) nullsSeen += 1;
      if (money && money.priorRepaymentRate !== null) {
        expect(money.priorRepaymentRate).toBeGreaterThan(0);
      }
    }
    expect(nullsSeen).toBeGreaterThan(20);
  });
});

describe('a failing source degrades rather than breaking the assessment', () => {
  it('turns a thrown error into an unavailable result', async () => {
    const exploding: DataAdapter<never> = {
      source: 'exploding/test',
      mode: 'live',
      async fetch() {
        throw new Error('upstream 503');
      },
    };

    const bundle = await collectFeatures(contextFor(), {
      ...mockSet(),
      // The set is typed per source; this stands in for the satellite one.
      satellite: exploding as unknown as AdapterSet['satellite'],
    });

    expect(bundle.satellite.quality).toBe('unavailable');
    expect(bundle.satellite.features).toBeNull();
    expect(bundle.satellite.completeness).toBe(0);
    expect(bundle.satellite.notes[0]).toContain('upstream 503');

    // The other two sources are unaffected.
    expect(bundle.weather.features).not.toBeNull();
  });
});

describe('regional grounding', () => {
  it('maps coordinates to the right agro-ecological zone', () => {
    expect(zoneFor(-0.42, 36.95).zone).toBe('highlands');
    expect(zoneFor(0.28, 34.75).zone).toBe('lake-basin');
    expect(zoneFor(-1.5, 38.5).zone).toBe('semi-arid-east');
    expect(zoneFor(-4.0, 39.6).zone).toBe('coastal');
    expect(zoneFor(3.1, 35.6).zone).toBe('arid-north');
  });

  it('gives the arid north less rain than the lake basin', async () => {
    const weather = new MockWeatherAdapter(SEED);

    async function meanRainfall(lat: number, lng: number): Promise<number> {
      let total = 0;
      let count = 0;
      for (let i = 0; i < 60; i += 1) {
        const result = await weather.fetch(
          contextFor({
            farmerId: `f-${i}`,
            latitude: lat + i * 0.01,
            longitude: lng + i * 0.01,
          }),
        );
        if (result.features) {
          total += result.features.seasonRainfallMm;
          count += 1;
        }
      }
      return total / count;
    }

    const north = await meanRainfall(3.1, 35.6);
    const west = await meanRainfall(0.28, 34.4);
    expect(north).toBeLessThan(west);
  });
});
