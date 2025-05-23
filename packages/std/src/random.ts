import type { RNG } from "random";
import { MathRandomRNG } from "random";

export * from "random";

export function randomItem<T>(
  arr: readonly T[],
  rng: RNG = defaultRng,
): T | undefined {
  return arr[Math.floor(rng.next() * arr.length)];
}

export function randomizeArray<T>(
  arr: readonly T[],
  rng: RNG = defaultRng,
): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const defaultRng = new MathRandomRNG();
