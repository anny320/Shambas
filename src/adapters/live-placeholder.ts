import type { AdapterResult, DataAdapter, FarmContext } from '@/adapters/types';

/**
 * Placeholder for a source whose live implementation has not been built yet.
 *
 * Selecting `live` for such a source fails loudly at startup rather than
 * silently falling back to the mock. Quietly serving mock data to something
 * configured for live is exactly the failure that ends up in a real credit
 * decision without anyone noticing.
 *
 * Open-Meteo is the intended first live adapter: no key and no partnership.
 */
export class NotImplementedLiveAdapter<TFeatures>
  implements DataAdapter<TFeatures>
{
  readonly mode = 'live' as const;

  constructor(
    readonly source: string,
    private readonly envVar: string,
  ) {}

  async fetch(_context: FarmContext): Promise<AdapterResult<TFeatures>> {
    throw new Error(
      `No live adapter exists for ${this.source} yet. ` +
        `Set ${this.envVar}=mock, or implement the live adapter behind the ` +
        `same DataAdapter interface.`,
    );
  }
}
