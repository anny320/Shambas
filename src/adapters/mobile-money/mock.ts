import type {
  AdapterResult,
  DataAdapter,
  FarmContext,
  MobileMoneyFeatures,
} from '@/adapters/types';
import { SeededRandom, clamp, round } from '@/adapters/random';
import { zoneFor } from '@/adapters/regions';

/**
 * Stand-in for a consented M-Pesa transaction summary.
 *
 * This is the signal most often missing in reality, and the mock reflects
 * that: roughly a fifth of farmers have no linkable or consented history, and
 * a further share have only a few months. That is not a flaw in the demo, it
 * is the thin-file problem the product exists to handle. An unavailable
 * result here should visibly lower confidence rather than quietly disappear.
 *
 * `priorRepaymentRate` is null when no prior credit was seen. Null is not
 * zero: a farmer who has never borrowed has not repaid badly.
 */
export class MockMobileMoneyAdapter
  implements DataAdapter<MobileMoneyFeatures>
{
  readonly source = 'mpesa-daraja/mock';
  readonly mode = 'mock' as const;

  constructor(private readonly seed: string) {}

  async fetch(
    context: FarmContext,
  ): Promise<AdapterResult<MobileMoneyFeatures>> {
    const random = new SeededRandom(
      `${this.seed}:mobile-money:${context.farmerId}`,
    );
    const fetchedAt = context.asOf.toISOString();
    const notes: string[] = [];

    if (random.chance(0.2)) {
      return {
        source: this.source,
        quality: 'unavailable',
        completeness: 0,
        features: null,
        notes: [
          'No mobile-money history could be linked for this farmer. This is ' +
            'a gap in the evidence, not a negative signal.',
        ],
        fetchedAt,
      };
    }

    const monthsObserved = random.chance(0.25)
      ? random.intBetween(2, 5)
      : random.intBetween(6, 24);

    const zone = zoneFor(context.latitude, context.longitude);

    // Farm income scales with area and with how productive the zone is, but
    // most smallholder inflow is off-farm and petty trade, so the floor is
    // well above zero even on a small plot.
    const zoneIncomeFactor = zone.seasonRainfallMm.mean / 600;
    const medianMonthlyInflowKes = Math.round(
      clamp(
        random.normalish(
          4200 + context.farmSizeHa * 3100 * zoneIncomeFactor,
          2200,
          800,
          90_000,
        ),
        800,
        90_000,
      ),
    );

    const inflowVolatility = round(random.normalish(0.45, 0.16, 0.05, 0.95), 3);
    // Regularity and volatility describe the same thing from two sides, so
    // they must not contradict each other.
    const inflowRegularity = round(
      clamp(1 - inflowVolatility * random.between(0.8, 1.1), 0.05, 0.97),
      3,
    );

    const averageBalanceKes = Math.round(
      clamp(
        medianMonthlyInflowKes * random.between(0.06, 0.42),
        50,
        60_000,
      ),
    );

    const distinctCounterparties = random.intBetween(3, 45);

    // Most smallholders have no formal credit history at all. Where one
    // exists it is usually good, because bad borrowers stop being lent to.
    const hasPriorCredit = random.chance(0.42);
    const priorRepaymentRate = hasPriorCredit
      ? round(random.normalish(0.88, 0.12, 0.3, 1), 3)
      : null;

    if (priorRepaymentRate === null) {
      notes.push(
        'No prior credit obligations observed, so there is no repayment ' +
          'track record either way.',
      );
    }

    const thin = monthsObserved < 6;
    if (thin) {
      notes.push(
        `Only ${monthsObserved} months of mobile-money history. Too short to ` +
          'read a reliable income pattern from.',
      );
    }

    const completeness = round(
      clamp(Math.min(1, monthsObserved / 12) * (hasPriorCredit ? 1 : 0.85), 0, 1),
      2,
    );

    return {
      source: this.source,
      quality: thin ? 'partial' : 'ok',
      completeness,
      features: {
        monthsObserved,
        inflowRegularity,
        medianMonthlyInflowKes,
        inflowVolatility,
        averageBalanceKes,
        distinctCounterparties,
        priorRepaymentRate,
      },
      notes,
      fetchedAt,
    };
  }
}
