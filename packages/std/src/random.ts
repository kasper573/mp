import { createRNG, type RNG as RngImpl } from "random";

export class Rng {
  private generator: RngImpl;

  constructor(seed?: number | string) {
    this.generator = createRNG(seed);
  }

  next(): number {
    return this.generator.next();
  }

  randomItem<T>(arr: Iterable<T>): T {
    const items = Array.from(arr);
    return items[Math.floor(this.next() * items.length)];
  }

  randomItemMaybe<T>(arr: Iterable<T>): T | undefined {
    return this.randomItem(arr);
  }

  randomizeArray<T>(arr: readonly T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
