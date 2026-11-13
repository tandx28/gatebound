/** Small seeded generator (mulberry32). Returns numbers in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an index in [0, n) from a generator, safe even if it returns 1. */
export function pick(rng: () => number, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}
