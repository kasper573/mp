import { NotifiableSignal } from "./custom-signals/notifiable-signal";

export class SignalMap<K, V> extends Map<K, V> {
  #signal: NotifiableSignal<Map<K, V>>;

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    // Omit entries from super call since we store values in a signal
    super();
    this.#signal = new NotifiableSignal(new Map<K, V>(entries));
  }

  override clear(): void {
    const map = this.#signal.value;
    if (map.size > 0) {
      map.clear();
      this.#signal.notify();
    }
  }
  override delete(key: K): boolean {
    const deleted = this.#signal.value.delete(key);
    if (deleted) {
      this.#signal.notify();
    }
    return deleted;
  }
  override forEach<ThisArg>(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: ThisArg,
  ): void {
    this.#signal.value.forEach(callbackfn, thisArg);
  }
  override get(key: K): V | undefined {
    return this.#signal.value.get(key);
  }
  override has(key: K): boolean {
    return this.#signal.value.has(key);
  }
  override set(key: K, value: V): this {
    this.#signal.value.set(key, value);
    this.#signal.notify();
    return this;
  }
  override get size(): number {
    return this.#signal.value.size;
  }
  override entries(): MapIterator<[K, V]> {
    return this.#signal.value.entries();
  }
  override keys(): MapIterator<K> {
    return this.#signal.value.keys();
  }
  override values(): MapIterator<V> {
    return this.#signal.value.values();
  }
  override [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#signal.value[Symbol.iterator]();
  }
  override get [Symbol.toStringTag](): string {
    return this.#signal.value[Symbol.toStringTag];
  }
}
