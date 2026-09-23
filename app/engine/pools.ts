// Pool sizing (moved from app/js/04-engine-pools.js, step 2.0 engine-bridge).

/**
 * Frozen template library for 6..40 entrants: as many 4-person pools as possible
 * while avoiding 2-person pools.
 */
const POOL_SIZE_TEMPLATES: Readonly<Record<number, readonly number[]>> = {
  6: [3, 3], 7: [4, 3], 8: [4, 4],
  9: [3, 3, 3], 10: [4, 3, 3], 11: [4, 4, 3],
  12: [4, 4, 4], 13: [4, 3, 3, 3], 14: [4, 4, 3, 3], 15: [4, 4, 4, 3], 16: [4, 4, 4, 4],
  17: [4, 4, 3, 3, 3], 18: [4, 4, 4, 3, 3], 19: [4, 4, 4, 4, 3], 20: [4, 4, 4, 4, 4],
  21: [4, 4, 4, 3, 3, 3], 22: [4, 4, 4, 4, 3, 3],
  23: [4, 4, 3, 3, 3, 3, 3], 24: [4, 4, 4, 3, 3, 3, 3], 25: [4, 4, 4, 4, 3, 3, 3], 26: [4, 4, 4, 4, 4, 3, 3], 27: [4, 4, 4, 4, 4, 4, 3], 28: [4, 4, 4, 4, 4, 4, 4],
  29: [4, 4, 4, 4, 4, 3, 3, 3], 30: [4, 4, 4, 4, 4, 4, 3, 3], 31: [4, 4, 4, 4, 4, 4, 4, 3], 32: [4, 4, 4, 4, 4, 4, 4, 4],
  33: [4, 4, 4, 4, 4, 4, 3, 3, 3], 34: [4, 4, 4, 4, 4, 4, 4, 3, 3], 35: [4, 4, 4, 4, 4, 4, 4, 4, 3], 36: [4, 4, 4, 4, 4, 4, 4, 4, 4],
  37: [4, 4, 4, 4, 4, 4, 4, 3, 3, 3], 38: [4, 4, 4, 4, 4, 4, 4, 4, 3, 3], 39: [4, 4, 4, 4, 4, 4, 4, 4, 4, 3], 40: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
};

/**
 * Pool sizes for `n` entrants: the template for 6..40, otherwise pools of 3 with the
 * remainder added round-robin (n=5 → [5], never a lost entrant). Always a new array.
 */
export function poolSizes(n: number): number[] {
  const template = POOL_SIZE_TEMPLATES[n];
  if (template) return [...template];
  let poolCount = Math.max(1, Math.ceil(n / 4));
  while (n / poolCount < 3 && poolCount > 1) poolCount--;
  const sizes: number[] = Array<number>(poolCount).fill(3);
  const rem = n - poolCount * 3;
  for (let i = 0; i < rem; i++) sizes[i % poolCount] = (sizes[i % poolCount] ?? 3) + 1;
  return sizes;
}
