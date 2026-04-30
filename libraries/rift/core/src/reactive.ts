import { Signal } from "@preact/signals-core";

export class ReactiveSet<T> extends Signal<number> {
  readonly #set = new Set<T>();

  constructor() {
    super(0);
  }

  get size(): number {
    void this.value;
    return this.#set.size;
  }

  has(item: T): boolean {
    void this.value;
    return this.#set.has(item);
  }

  add(item: T): boolean {
    const before = this.#set.size;
    this.#set.add(item);
    if (this.#set.size === before) {
      return false;
    }
    this.value = this.peek() + 1;
    return true;
  }

  delete(item: T): boolean {
    if (!this.#set.delete(item)) {
      return false;
    }
    this.value = this.peek() + 1;
    return true;
  }

  peekHas(item: T): boolean {
    return this.#set.has(item);
  }

  [Symbol.iterator](): IterableIterator<T> {
    void this.value;
    return this.#set.values();
  }
}

export class ReactiveMap<K, V> extends Signal<number> {
  readonly #map = new Map<K, V>();

  constructor() {
    super(0);
  }

  get size(): number {
    void this.value;
    return this.#map.size;
  }

  has(key: K): boolean {
    void this.value;
    return this.#map.has(key);
  }

  get(key: K): V | undefined {
    void this.value;
    return this.#map.get(key);
  }

  peekGet(key: K): V | undefined {
    return this.#map.get(key);
  }

  set(key: K, value: V): void {
    const before = this.#map.size;
    this.#map.set(key, value);
    if (this.#map.size !== before) {
      this.value = this.peek() + 1;
    }
  }

  delete(key: K): boolean {
    if (!this.#map.delete(key)) {
      return false;
    }
    this.value = this.peek() + 1;
    return true;
  }

  values(): IterableIterator<V> {
    void this.value;
    return this.#map.values();
  }
}
