/**
 * Environment access, validated once and in one place.
 *
 * Anything that reads process.env goes through here so a missing or malformed
 * variable fails loudly at the boundary rather than as an undefined deep
 * inside a request.
 */

/**
 * Reads a variable, treating a blank value as absent.
 *
 * Hosting dashboards routinely CREATE a variable with an empty value — Vercel
 * pre-fills every name it finds in .env.example when you import a repo. An
 * empty string is not nullish, so `process.env.X ?? fallback` does not catch
 * it and the fallback never fires. Everything here goes through this instead,
 * so "present but blank" behaves the same as "not set".
 */
function optional(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export type AdapterMode = 'mock' | 'live';

function adapterMode(name: string): AdapterMode {
  const raw = (optional(name) ?? 'mock').toLowerCase();
  if (raw === 'mock' || raw === 'live') return raw;
  throw new Error(
    `${name} must be "mock" or "live", got ${JSON.stringify(raw)}.`,
  );
}

/**
 * Which implementation each data source should use. Defaults to mock
 * everywhere, so a checkout with no API keys runs end to end.
 */
export function adapterModes(): {
  satellite: AdapterMode;
  weather: AdapterMode;
  mobileMoney: AdapterMode;
} {
  return {
    satellite: adapterMode('SATELLITE_ADAPTER'),
    weather: adapterMode('WEATHER_ADAPTER'),
    mobileMoney: adapterMode('MOBILE_MONEY_ADAPTER'),
  };
}

export function mockSeed(): string {
  return optional('MOCK_ADAPTER_SEED') ?? 'shamba-dev';
}
