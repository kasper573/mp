import { Signal, signal } from "@preact/signals-core";
import type { Reader } from "./reader";
import type { Writer } from "./writer";

export interface RootState {
  dirty: boolean;
  onDirty?: () => void;
}

export interface RiftSignal<T> {
  readonly value: T;
  peek(): T;
  set(v: T): void;
  readonly dirty: boolean;
  clearDirty(): void;
  setRoot(root: RootState): void;
  encode(w: Writer): void;
  decode(r: Reader): void;
}

function markDirty(root: RootState): void {
  if (root.dirty) {
    return;
  }
  root.dirty = true;
  root.onDirty?.();
}

export class LeafSignal<T> extends Signal<T> implements RiftSignal<T> {
  #root: RootState = { dirty: false };
  #encode: (w: Writer, v: T) => void;
  #decode: (r: Reader) => T;

  constructor(
    initial: T,
    encode: (w: Writer, v: T) => void,
    decode: (r: Reader) => T,
  ) {
    super(initial);
    this.#encode = encode;
    this.#decode = decode;
  }

  set(v: T): void {
    if (this.peek() === v) {
      return;
    }
    this.value = v;
    markDirty(this.#root);
  }
  get dirty(): boolean {
    return this.#root.dirty;
  }
  clearDirty(): void {
    this.#root.dirty = false;
  }
  setRoot(r: RootState): void {
    this.#root = r;
  }
  encode(w: Writer): void {
    this.#encode(w, this.peek());
  }
  decode(r: Reader): void {
    this.value = this.#decode(r);
  }
}

const objectHandler: ProxyHandler<Record<string, RiftSignal<unknown>>> = {
  get(fields, key) {
    if (typeof key !== "string") {
      return undefined;
    }
    const child = fields[key];
    return child === undefined ? undefined : child.value;
  },
  set(fields, key, value: unknown) {
    if (typeof key !== "string") {
      return false;
    }
    const child = fields[key];
    if (child === undefined) {
      return false;
    }
    child.set(value);
    return true;
  },
  has(fields, key) {
    return typeof key === "string" && key in fields;
  },
  ownKeys(fields) {
    return Object.keys(fields);
  },
  getOwnPropertyDescriptor(fields, key) {
    if (typeof key !== "string") {
      return undefined;
    }
    const child = fields[key];
    if (child === undefined) {
      return undefined;
    }
    return {
      enumerable: true,
      configurable: true,
      value: child.value,
      writable: true,
    };
  },
};

export class ObjectSignal<
  T extends Record<string, unknown>,
> implements RiftSignal<T> {
  #fields: { [K in keyof T]: RiftSignal<T[K]> };
  #order: readonly (keyof T & string)[];
  #root: RootState = { dirty: false };
  #proxy: T;

  constructor(
    fields: { [K in keyof T]: RiftSignal<T[K]> },
    order: readonly (keyof T & string)[],
  ) {
    this.#fields = fields;
    this.#order = order;
    for (const k of order) {
      fields[k].setRoot(this.#root);
    }
    this.#proxy = new Proxy(
      fields as unknown as Record<string, RiftSignal<unknown>>,
      objectHandler,
    ) as unknown as T;
  }

  get value(): T {
    return this.#proxy;
  }
  peek(): T {
    const out: Record<string, unknown> = {};
    const fields = this.#fields;
    for (const k of this.#order) {
      out[k] = fields[k].peek();
    }
    return out as T;
  }
  set(v: T): void {
    const fields = this.#fields;
    for (const k of this.#order) {
      fields[k].set(v[k]);
    }
  }
  get dirty(): boolean {
    return this.#root.dirty;
  }
  clearDirty(): void {
    this.#root.dirty = false;
  }
  setRoot(r: RootState): void {
    this.#root = r;
    const fields = this.#fields;
    for (const k of this.#order) {
      fields[k].setRoot(r);
    }
  }
  encode(w: Writer): void {
    const fields = this.#fields;
    for (const k of this.#order) {
      fields[k].encode(w);
    }
  }
  decode(r: Reader): void {
    const fields = this.#fields;
    for (const k of this.#order) {
      fields[k].decode(r);
    }
  }
}

export class ArraySignal<T> implements RiftSignal<readonly T[]> {
  #sig: Signal<readonly T[]>;
  #root: RootState = { dirty: false };
  #encodeItem: (w: Writer, v: T) => void;
  #decodeItem: (r: Reader) => T;

  constructor(
    initial: readonly T[],
    encodeItem: (w: Writer, v: T) => void,
    decodeItem: (r: Reader) => T,
  ) {
    this.#sig = signal<readonly T[]>(initial);
    this.#encodeItem = encodeItem;
    this.#decodeItem = decodeItem;
  }

  get value(): readonly T[] {
    return this.#sig.value;
  }
  peek(): readonly T[] {
    return this.#sig.peek();
  }
  set(v: readonly T[]): void {
    this.#sig.value = v;
    markDirty(this.#root);
  }
  get dirty(): boolean {
    return this.#root.dirty;
  }
  clearDirty(): void {
    this.#root.dirty = false;
  }
  setRoot(r: RootState): void {
    this.#root = r;
  }
  encode(w: Writer): void {
    const arr = this.#sig.peek();
    w.writeU32(arr.length);
    const enc = this.#encodeItem;
    for (let i = 0; i < arr.length; i++) {
      enc(w, arr[i]);
    }
  }
  decode(r: Reader): void {
    const n = r.readU32();
    const arr = new Array<T>(n);
    const dec = this.#decodeItem;
    for (let i = 0; i < n; i++) {
      arr[i] = dec(r);
    }
    this.#sig.value = arr;
  }
}

const tupleHandler: ProxyHandler<readonly RiftSignal<unknown>[]> = {
  get(children, key) {
    if (key === "length") {
      return children.length;
    }
    if (typeof key !== "string") {
      return undefined;
    }
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= children.length) {
      return undefined;
    }
    return children[idx].value;
  },
  set(children, key, value: unknown) {
    if (typeof key !== "string") {
      return false;
    }
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= children.length) {
      return false;
    }
    children[idx].set(value);
    return true;
  },
};

export class TupleSignal<
  T extends readonly unknown[],
> implements RiftSignal<T> {
  #children: { [K in keyof T]: RiftSignal<T[K]> };
  #root: RootState = { dirty: false };
  #proxy: T;

  constructor(children: { [K in keyof T]: RiftSignal<T[K]> }) {
    this.#children = children;
    for (const c of children) {
      c.setRoot(this.#root);
    }
    this.#proxy = new Proxy(
      children as unknown as readonly RiftSignal<unknown>[],
      tupleHandler,
    ) as unknown as T;
  }

  get value(): T {
    return this.#proxy;
  }
  peek(): T {
    const children = this.#children;
    const out = new Array<unknown>(children.length);
    for (let i = 0; i < children.length; i++) {
      out[i] = children[i].peek();
    }
    return out as unknown as T;
  }
  set(v: T): void {
    const children = this.#children;
    for (let i = 0; i < children.length; i++) {
      children[i].set(v[i] as T[number]);
    }
  }
  get dirty(): boolean {
    return this.#root.dirty;
  }
  clearDirty(): void {
    this.#root.dirty = false;
  }
  setRoot(r: RootState): void {
    this.#root = r;
    for (const c of this.#children) {
      c.setRoot(r);
    }
  }
  encode(w: Writer): void {
    for (const c of this.#children) {
      c.encode(w);
    }
  }
  decode(r: Reader): void {
    for (const c of this.#children) {
      c.decode(r);
    }
  }
}

export class OptionalSignal<T> implements RiftSignal<T | undefined> {
  #present: Signal<boolean>;
  #inner: RiftSignal<T>;
  #root: RootState = { dirty: false };

  constructor(inner: RiftSignal<T>, initial: T | undefined) {
    this.#inner = inner;
    this.#present = signal(initial !== undefined);
    inner.setRoot(this.#root);
    if (initial !== undefined) {
      inner.set(initial);
    }
  }

  get value(): T | undefined {
    return this.#present.value ? this.#inner.value : undefined;
  }
  peek(): T | undefined {
    return this.#present.peek() ? this.#inner.peek() : undefined;
  }
  set(v: T | undefined): void {
    if (v === undefined) {
      if (this.#present.peek()) {
        this.#present.value = false;
        markDirty(this.#root);
      }
    } else {
      if (!this.#present.peek()) {
        this.#present.value = true;
      }
      this.#inner.set(v);
    }
  }
  get dirty(): boolean {
    return this.#root.dirty;
  }
  clearDirty(): void {
    this.#root.dirty = false;
  }
  setRoot(r: RootState): void {
    this.#root = r;
    this.#inner.setRoot(r);
  }
  encode(w: Writer): void {
    const p = this.#present.peek();
    w.writeBool(p);
    if (p) {
      this.#inner.encode(w);
    }
  }
  decode(r: Reader): void {
    const p = r.readBool();
    this.#present.value = p;
    if (p) {
      this.#inner.decode(r);
    }
  }
}

export interface UnionVariant<Tag extends string, V> {
  readonly tag: Tag;
  readonly value: V;
}

export class UnionSignal<
  V extends Record<string, unknown>,
> implements RiftSignal<
  { [K in keyof V]: UnionVariant<K & string, V[K]> }[keyof V]
> {
  #variants: { [K in keyof V]: RiftSignal<V[K]> };
  #order: readonly (keyof V & string)[];
  #tag: Signal<keyof V & string>;
  #root: RootState = { dirty: false };

  constructor(
    variants: { [K in keyof V]: RiftSignal<V[K]> },
    order: readonly (keyof V & string)[],
    initial: { [K in keyof V]: UnionVariant<K & string, V[K]> }[keyof V],
  ) {
    this.#variants = variants;
    this.#order = order;
    this.#tag = signal(initial.tag);
    for (const k of order) {
      variants[k].setRoot(this.#root);
    }
    variants[initial.tag].set(initial.value as V[keyof V & string]);
  }

  get value(): { [K in keyof V]: UnionVariant<K & string, V[K]> }[keyof V] {
    const tag = this.#tag.value;
    return { tag, value: this.#variants[tag].value } as {
      [K in keyof V]: UnionVariant<K & string, V[K]>;
    }[keyof V];
  }
  peek(): { [K in keyof V]: UnionVariant<K & string, V[K]> }[keyof V] {
    const tag = this.#tag.peek();
    return { tag, value: this.#variants[tag].peek() } as {
      [K in keyof V]: UnionVariant<K & string, V[K]>;
    }[keyof V];
  }
  set(v: { [K in keyof V]: UnionVariant<K & string, V[K]> }[keyof V]): void {
    this.#tag.value = v.tag;
    this.#variants[v.tag].set(v.value as V[keyof V & string]);
    markDirty(this.#root);
  }
  get dirty(): boolean {
    return this.#root.dirty;
  }
  clearDirty(): void {
    this.#root.dirty = false;
  }
  setRoot(r: RootState): void {
    this.#root = r;
    const variants = this.#variants;
    for (const k of this.#order) {
      variants[k].setRoot(r);
    }
  }
  encode(w: Writer): void {
    const tag = this.#tag.peek();
    const idx = this.#order.indexOf(tag);
    w.writeU16(idx);
    this.#variants[tag].encode(w);
  }
  decode(r: Reader): void {
    const idx = r.readU16();
    const tag = this.#order[idx];
    this.#tag.value = tag;
    this.#variants[tag].decode(r);
  }
}

export class TransformSignal<Inner, Outer> implements RiftSignal<Outer> {
  #inner: RiftSignal<Inner>;
  #from: (v: Inner) => Outer;
  #to: (v: Outer) => Inner;

  constructor(
    inner: RiftSignal<Inner>,
    fromInner: (v: Inner) => Outer,
    toInner: (v: Outer) => Inner,
  ) {
    this.#inner = inner;
    this.#from = fromInner;
    this.#to = toInner;
  }

  get value(): Outer {
    return this.#from(this.#inner.value);
  }
  peek(): Outer {
    return this.#from(this.#inner.peek());
  }
  set(v: Outer): void {
    this.#inner.set(this.#to(v));
  }
  get dirty(): boolean {
    return this.#inner.dirty;
  }
  clearDirty(): void {
    this.#inner.clearDirty();
  }
  setRoot(r: RootState): void {
    this.#inner.setRoot(r);
  }
  encode(w: Writer): void {
    this.#inner.encode(w);
  }
  decode(r: Reader): void {
    this.#inner.decode(r);
  }
}
