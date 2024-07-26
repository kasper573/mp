export type CleanupFn = () => void;

export class Cleanup {
  private fns = new Set<CleanupFn>();

  add(...fns: CleanupFn[]) {
    for (const fn of fns) {
      this.fns.add(fn);
    }
  }

  flush() {
    this.fns.forEach((fn) => fn());
    this.fns.clear();
  }
}

export class CleanupMap<Key> {
  private map = new Map<Key, Cleanup>();

  add(key: Key, ...fns: CleanupFn[]) {
    let cleanup = this.map.get(key);
    if (!cleanup) {
      this.map.set(key, (cleanup = new Cleanup()));
    }
    cleanup.add(...fns);
  }

  flush(key: Key) {
    this.map.get(key)?.flush();
  }
}
