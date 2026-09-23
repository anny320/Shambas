import { afterEach, describe, expect, it } from 'vitest';
import { adapterModes, mockSeed } from '@/lib/env';

const KEYS = [
  'SATELLITE_ADAPTER',
  'WEATHER_ADAPTER',
  'MOBILE_MONEY_ADAPTER',
  'MOCK_ADAPTER_SEED',
] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe('environment variables that are present but blank', () => {
  /*
   * This is not hypothetical. Importing the repo into Vercel makes it read
   * .env.example and create all eight variables with empty values. Before
   * this was handled, deploying without hand-filling the adapter settings
   * threw `SATELLITE_ADAPTER must be "mock" or "live", got ""` on every
   * request.
   */
  it('treats an empty adapter setting as unset, not as invalid', () => {
    for (const key of KEYS) process.env[key] = '';
    expect(() => adapterModes()).not.toThrow();
    expect(adapterModes()).toEqual({
      satellite: 'mock',
      weather: 'mock',
      mobileMoney: 'mock',
    });
  });

  it('treats a whitespace-only setting as unset too', () => {
    process.env['SATELLITE_ADAPTER'] = '   ';
    expect(adapterModes().satellite).toBe('mock');
  });

  it('falls back to the default seed when the seed is blank', () => {
    process.env['MOCK_ADAPTER_SEED'] = '';
    expect(mockSeed()).toBe('shamba-dev');
    process.env['MOCK_ADAPTER_SEED'] = '  ';
    expect(mockSeed()).toBe('shamba-dev');
  });
});

describe('adapter settings that are actually set', () => {
  it('honours a real value, whatever its casing or padding', () => {
    process.env['WEATHER_ADAPTER'] = '  LIVE  ';
    expect(adapterModes().weather).toBe('live');
    process.env['WEATHER_ADAPTER'] = 'Mock';
    expect(adapterModes().weather).toBe('mock');
  });

  it('still rejects a value that is set but meaningless', () => {
    process.env['SATELLITE_ADAPTER'] = 'maybe';
    expect(() => adapterModes()).toThrow(/must be "mock" or "live"/);
  });

  it('uses a real seed when one is given', () => {
    process.env['MOCK_ADAPTER_SEED'] = 'demo-2026';
    expect(mockSeed()).toBe('demo-2026');
  });
});
