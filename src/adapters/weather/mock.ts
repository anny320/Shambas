import type {
  AdapterResult,
  DataAdapter,
  FarmContext,
  WeatherFeatures,
} from '@/adapters/types';
import { SeededRandom, clamp, round } from '@/adapters/random';
import { zoneFor } from '@/adapters/regions';

/**
 * Stand-in for rainfall history at the farm's location.
 *
 * Shaped after what CHIRPS gives for Kenya: a long record, coarse resolution,
 * and very different reliability between the western highlands and the arid
 * north. This is the adapter that goes live first (Open-Meteo needs no key
 * and no partnership), so its feature shape is the one to keep stable.
 */
export class MockWeatherAdapter implements DataAdapter<WeatherFeatures> {
  readonly source = 'chirps-openmeteo/mock';
  readonly mode = 'mock' as const;

  constructor(private readonly seed: string) {}

  async fetch(context: FarmContext): Promise<AdapterResult<WeatherFeatures>> {
    const random = new SeededRandom(
      `${this.seed}:weather:${context.latitude.toFixed(3)}:${context.longitude.toFixed(3)}`,
    );
    const zone = zoneFor(context.latitude, context.longitude);
    const fetchedAt = context.asOf.toISOString();
    const notes: string[] = [];

    // Gridded rainfall covers all of Kenya, so this is the one signal that is
    // essentially always available. Occasionally the record is short.
    const seasonsOfHistory = random.chance(0.08)
      ? random.intBetween(4, 9)
      : random.intBetween(20, 40);

    const normMm = zone.seasonRainfallMm.mean;
    const seasonRainfallMm = Math.round(
      random.normalish(
        normMm,
        zone.seasonRainfallMm.spread,
        normMm * 0.25,
        normMm * 2.1,
      ),
    );

    const rainfallVsNormRatio = round(seasonRainfallMm / normMm, 3);

    const rainfallReliability = round(
      random.normalish(
        zone.reliability.mean,
        zone.reliability.spread,
        0.15,
        0.95,
      ),
      3,
    );

    // Drier zones run longer dry spells, and a dry season runs longer ones
    // still.
    const baseDrySpell = clamp(46 - zone.seasonRainfallMm.mean / 22, 8, 45);
    const longestDrySpellDays = Math.round(
      clamp(
        random.normalish(baseDrySpell, 6, 4, 70) *
          (rainfallVsNormRatio < 0.8 ? 1.25 : 1),
        4,
        80,
      ),
    );

    let droughtSeasonsLast5 = 0;
    let floodSeasonsLast5 = 0;
    for (let season = 0; season < 5; season += 1) {
      if (random.chance(zone.droughtSeasonRate)) droughtSeasonsLast5 += 1;
      else if (random.chance(zone.floodSeasonRate)) floodSeasonsLast5 += 1;
    }

    notes.push(
      `${zone.label}: long-run seasonal norm about ${Math.round(normMm)} mm.`,
    );

    if (rainfallVsNormRatio < 0.75) {
      notes.push(
        `Season rainfall was ${Math.round((1 - rainfallVsNormRatio) * 100)}% ` +
          'below the local norm.',
      );
    }
    if (droughtSeasonsLast5 >= 2) {
      notes.push(
        `${droughtSeasonsLast5} of the last 5 seasons were drought seasons here.`,
      );
    }

    const shortRecord = seasonsOfHistory < 10;
    if (shortRecord) {
      notes.push(
        `Only ${seasonsOfHistory} seasons of rainfall history at this ` +
          'location, so the local norm is a weak baseline.',
      );
    }

    const completeness = round(
      clamp(0.5 + 0.5 * Math.min(1, seasonsOfHistory / 20), 0, 1),
      2,
    );

    return {
      source: this.source,
      quality: shortRecord ? 'partial' : 'ok',
      completeness,
      features: {
        seasonRainfallMm,
        rainfallVsNormRatio,
        rainfallReliability,
        longestDrySpellDays,
        droughtSeasonsLast5,
        floodSeasonsLast5,
        seasonsOfHistory,
      },
      notes,
      fetchedAt,
    };
  }
}
