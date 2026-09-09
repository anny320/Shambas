import type {
  AdapterResult,
  DataAdapter,
  FarmContext,
  SatelliteFeatures,
} from '@/adapters/types';
import { SeededRandom, clamp, round } from '@/adapters/random';
import { zoneFor } from '@/adapters/regions';

/**
 * Stand-in for Sentinel-2 NDVI over the farm.
 *
 * Draws from the agro-ecological zone the pin falls in, so a farm in the arid
 * north does not look like one in Kakamega. Cloud is modelled honestly:
 * heavy cloud costs observations, and few observations means `partial`, not a
 * confident number built from two usable passes.
 */
export class MockSatelliteAdapter implements DataAdapter<SatelliteFeatures> {
  readonly source = 'sentinel-2/mock';
  readonly mode = 'mock' as const;

  constructor(private readonly seed: string) {}

  async fetch(context: FarmContext): Promise<AdapterResult<SatelliteFeatures>> {
    const random = new SeededRandom(
      `${this.seed}:satellite:${context.farmerId}:${context.latitude.toFixed(4)}:${context.longitude.toFixed(4)}`,
    );
    const zone = zoneFor(context.latitude, context.longitude);
    const fetchedAt = context.asOf.toISOString();
    const notes: string[] = [];

    // A small share of farms genuinely cannot be resolved: persistent cloud,
    // or a plot too small for a clean 10 m signal.
    if (random.chance(0.05)) {
      return {
        source: this.source,
        quality: 'unavailable',
        completeness: 0,
        features: null,
        notes: [
          'No usable satellite passes over this farm in the last season, ' +
            'most likely persistent cloud cover.',
        ],
        fetchedAt,
      };
    }

    const cloudObscuredShare = round(random.between(0.05, 0.65), 2);
    // Sentinel-2 revisits about every five days, so roughly 36 passes a
    // season before cloud takes its share.
    const observationCount = Math.max(
      1,
      Math.round(36 * (1 - cloudObscuredShare) * random.between(0.8, 1.05)),
    );

    const ndviSeasonMean = round(
      random.normalish(
        zone.ndviSeasonMean.mean,
        zone.ndviSeasonMean.spread,
        0.08,
        0.92,
      ),
    );

    // A very small plot mixes in field edges, tracks and homestead, which
    // drags the measured mean down regardless of how the crop is doing.
    const mixedPixelPenalty = context.farmSizeHa < 0.4 ? 0.04 : 0;
    const adjustedMean = round(clamp(ndviSeasonMean - mixedPixelPenalty, 0.05, 0.95));
    if (mixedPixelPenalty > 0) {
      notes.push(
        'Farm is under 0.4 ha, so the satellite signal mixes in field edges ' +
          'and reads slightly low.',
      );
    }

    const ndviCurrent = round(
      clamp(adjustedMean * random.between(0.82, 1.15), 0.05, 0.95),
    );
    const ndviYearOnYearRatio = round(random.normalish(1.0, 0.13, 0.55, 1.5), 3);
    const ndviVsRegionalNorm = round(
      clamp(adjustedMean / zone.ndviSeasonMean.mean, 0.4, 1.75),
      3,
    );

    // Thin evidence is reported as thin, never smoothed over.
    const thin = observationCount < 12 || cloudObscuredShare > 0.55;
    if (thin) {
      notes.push(
        `Only ${observationCount} usable satellite passes this season ` +
          `(${Math.round(cloudObscuredShare * 100)}% lost to cloud). ` +
          'Treat the vegetation reading as indicative.',
      );
    }

    const completeness = round(
      clamp(
        0.35 + 0.65 * Math.min(1, observationCount / 24) * (1 - cloudObscuredShare * 0.5),
        0,
        1,
      ),
      2,
    );

    return {
      source: this.source,
      quality: thin ? 'partial' : 'ok',
      completeness,
      features: {
        ndviCurrent,
        ndviSeasonMean: adjustedMean,
        ndviYearOnYearRatio,
        ndviVsRegionalNorm,
        observationCount,
        cloudObscuredShare,
      },
      notes,
      fetchedAt,
    };
  }
}
