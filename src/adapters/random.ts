/**
 * Deterministic pseudo-randomness for the mock adapters.
 *
 * The mocks must be reproducible: the same farm, with the same seed, has to
 * produce the same features every time. Otherwise a demo tells a different
 * story on every refresh and a test cannot assert anything.
 *
 * Math.random cannot do that, hence a small seeded generator. This is for
 * fixture generation only — never use it for anything security-related.
 */

/** xmur3: string to a well-mixed 32-bit seed. */
function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32: fast, adequate spread, tiny. */
export class SeededRandom {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed);
  }

  /** Next value in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  between(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], inclusive. */
  intBetween(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }

  /**
   * Roughly normal, via the mean of four draws (Bates). Clamped to the given
   * bounds so a tail cannot produce an impossible NDVI or a negative balance.
   */
  normalish(mean: number, spread: number, min: number, max: number): number {
    const bates = (this.next() + this.next() + this.next() + this.next()) / 4;
    // Bates(4) has mean 0.5 and standard deviation 1/sqrt(48).
    const z = (bates - 0.5) * Math.sqrt(48);
    return clamp(mean + z * spread, min, max);
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to a fixed number of decimals, so fixtures read cleanly. */
export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
