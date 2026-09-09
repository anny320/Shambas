/**
 * Kenyan agro-ecological context for the mock adapters.
 *
 * These are coarse, deliberately. The point is that a farm in Turkana and a
 * farm in Kakamega should not draw from the same rainfall distribution, so a
 * demo behaves like Kenya rather than like a random number generator. Ranges
 * are order-of-magnitude figures consistent with the public sources listed in
 * PRD.md Appendix A (CHIRPS rainfall history, HarvestStat regional norms).
 *
 * When the live adapters land, this file stops being used for anything but
 * tests and seeding.
 */

export type AgroZone =
  | 'lake-basin'
  | 'highlands'
  | 'semi-arid-east'
  | 'coastal'
  | 'arid-north';

export interface ZoneProfile {
  zone: AgroZone;
  label: string;
  /** Typical rainfall for one growing season, in millimetres. */
  seasonRainfallMm: { mean: number; spread: number };
  /** How dependable that rainfall is, 0 to 1. */
  reliability: { mean: number; spread: number };
  /** Typical season-mean NDVI for cropland in the zone. */
  ndviSeasonMean: { mean: number; spread: number };
  /** Probability that any given season in the last five was a drought. */
  droughtSeasonRate: number;
  floodSeasonRate: number;
}

const PROFILES: Record<AgroZone, ZoneProfile> = {
  'lake-basin': {
    zone: 'lake-basin',
    label: 'Lake basin and western Kenya',
    seasonRainfallMm: { mean: 780, spread: 130 },
    reliability: { mean: 0.78, spread: 0.09 },
    ndviSeasonMean: { mean: 0.62, spread: 0.08 },
    droughtSeasonRate: 0.12,
    floodSeasonRate: 0.22,
  },
  highlands: {
    zone: 'highlands',
    label: 'Central and Rift Valley highlands',
    seasonRainfallMm: { mean: 620, spread: 120 },
    reliability: { mean: 0.74, spread: 0.1 },
    ndviSeasonMean: { mean: 0.58, spread: 0.09 },
    droughtSeasonRate: 0.18,
    floodSeasonRate: 0.12,
  },
  'semi-arid-east': {
    zone: 'semi-arid-east',
    label: 'Eastern semi-arid lands',
    seasonRainfallMm: { mean: 340, spread: 110 },
    reliability: { mean: 0.52, spread: 0.12 },
    ndviSeasonMean: { mean: 0.38, spread: 0.1 },
    droughtSeasonRate: 0.36,
    floodSeasonRate: 0.1,
  },
  coastal: {
    zone: 'coastal',
    label: 'Coastal lowlands',
    seasonRainfallMm: { mean: 520, spread: 140 },
    reliability: { mean: 0.62, spread: 0.11 },
    ndviSeasonMean: { mean: 0.5, spread: 0.1 },
    droughtSeasonRate: 0.24,
    floodSeasonRate: 0.16,
  },
  'arid-north': {
    zone: 'arid-north',
    label: 'Northern arid lands',
    seasonRainfallMm: { mean: 190, spread: 90 },
    reliability: { mean: 0.38, spread: 0.12 },
    ndviSeasonMean: { mean: 0.24, spread: 0.08 },
    droughtSeasonRate: 0.48,
    floodSeasonRate: 0.08,
  },
};

/**
 * Coarse zone lookup from a coordinate. Ordered from most to least specific;
 * the highlands are the fallback because that is where most of the smallholder
 * cropland this product serves actually sits.
 */
export function zoneFor(latitude: number, longitude: number): ZoneProfile {
  if (latitude > 1.6) return PROFILES['arid-north'];
  if (longitude > 39.0 && latitude < 0.5) return PROFILES.coastal;
  if (longitude < 35.2) return PROFILES['lake-basin'];
  if (longitude > 37.4) return PROFILES['semi-arid-east'];
  return PROFILES.highlands;
}

export function zoneProfile(zone: AgroZone): ZoneProfile {
  return PROFILES[zone];
}
