import { adapterModes, mockSeed } from '@/lib/env';
import { MockSatelliteAdapter } from '@/adapters/satellite/mock';
import { MockWeatherAdapter } from '@/adapters/weather/mock';
import { MockMobileMoneyAdapter } from '@/adapters/mobile-money/mock';
import { NotImplementedLiveAdapter } from '@/adapters/live-placeholder';
import type {
  DataAdapter,
  FarmContext,
  FeatureBundle,
  MobileMoneyFeatures,
  SatelliteFeatures,
  WeatherFeatures,
} from '@/adapters/types';

export * from '@/adapters/types';

export interface AdapterSet {
  satellite: DataAdapter<SatelliteFeatures>;
  weather: DataAdapter<WeatherFeatures>;
  mobileMoney: DataAdapter<MobileMoneyFeatures>;
}

/**
 * Builds the adapter set for the current environment.
 *
 * Each source is switched independently, so weather can go live while
 * satellite and mobile money stay mocked. Defaults are mock everywhere, which
 * is what lets a fresh checkout run with no credentials at all.
 */
export function createAdapters(seed: string = mockSeed()): AdapterSet {
  const modes = adapterModes();

  return {
    satellite:
      modes.satellite === 'mock'
        ? new MockSatelliteAdapter(seed)
        : new NotImplementedLiveAdapter<SatelliteFeatures>(
            'sentinel-2/live',
            'SATELLITE_ADAPTER',
          ),
    weather:
      modes.weather === 'mock'
        ? new MockWeatherAdapter(seed)
        : new NotImplementedLiveAdapter<WeatherFeatures>(
            'open-meteo/live',
            'WEATHER_ADAPTER',
          ),
    mobileMoney:
      modes.mobileMoney === 'mock'
        ? new MockMobileMoneyAdapter(seed)
        : new NotImplementedLiveAdapter<MobileMoneyFeatures>(
            'mpesa-daraja/live',
            'MOBILE_MONEY_ADAPTER',
          ),
  };
}

/**
 * Runs every adapter for one farm and returns the bundle the scoring engine
 * consumes.
 *
 * The three fetches are independent, so they run together. A source that
 * throws is turned into an `unavailable` result rather than failing the whole
 * assessment: one dead API must not stop an officer scoring an application,
 * it must only lower the confidence they are shown.
 */
export async function collectFeatures(
  context: FarmContext,
  adapters: AdapterSet = createAdapters(),
): Promise<FeatureBundle> {
  const [satellite, weather, mobileMoney] = await Promise.all([
    safeFetch(adapters.satellite, context),
    safeFetch(adapters.weather, context),
    safeFetch(adapters.mobileMoney, context),
  ]);

  return { context, satellite, weather, mobileMoney };
}

async function safeFetch<TFeatures>(
  adapter: DataAdapter<TFeatures>,
  context: FarmContext,
) {
  try {
    return await adapter.fetch(context);
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : 'unknown error';
    return {
      source: adapter.source,
      quality: 'unavailable' as const,
      completeness: 0,
      features: null,
      notes: [`This source could not be reached: ${reason}`],
      fetchedAt: context.asOf.toISOString(),
    };
  }
}
