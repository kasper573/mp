import { NotifiableSignal } from "./custom-signals/notifiable-signal";

export class SignalMap<K, V> {
  #signal: NotifiableSignal<Map<K, V>>;

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    this.#signal = new NotifiableSignal(new Map<K, V>(entries));
  }

  clear(): void {
    const map = this.#signal.value;
    if (map.size > 0) {
      map.clear();
      this.#signal.notify();
    }
  }
  delete(key: K): boolean {
    const deleted = this.#signal.value.delete(key);
    if (deleted) {
      this.#signal.notify();
    }
    return deleted;
  }
  get(key: K): V | undefined {
    return this.#signal.value.get(key);
  }
  has(key: K): boolean {
    return this.#signal.value.has(key);
  }
  set(key: K, value: V): this {
    this.#signal.value.set(key, value);
    this.#signal.notify();
    return this;
  }
  get size(): number {
    return this.#signal.value.size;
  }
  entries(): MapIterator<[K, V]> {
    return this.#signal.value.entries();
  }
  keys(): MapIterator<K> {
    return this.#signal.value.keys();
  }
  values(): MapIterator<V> {
    return this.#signal.value.values();
  }
  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#signal.value[Symbol.iterator]();
  }
  get [Symbol.toStringTag](): string {
    return this.#signal.value[Symbol.toStringTag];
  }
}
