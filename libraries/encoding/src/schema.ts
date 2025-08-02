export abstract class Schema<V> {
  abstract sizeOf(value: V): number;
  abstract encodeTo(dataView: DataView, offset: number, value: V): number;
  abstract decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: V; offset: number };

  get $infer(): V {
    throw new Error(
      "This should not be used at runtime. It exists only for type inference.",
    );
  }

  encode(value: V): Uint8Array {
    const length = this.sizeOf(value);
    const buffer = new ArrayBuffer(length);
    const dv = new DataView(buffer);
    this.encodeTo(dv, 0, value);
    return new Uint8Array(buffer);
  }

  decode(buffer: Uint8Array): V {
    const dv = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const result = this.decodeFrom(dv, 0);
    return result.value;
  }
}

export class BooleanSchema extends Schema<boolean> {
  sizeOf(_: boolean): number {
    return 1;
  }

  encodeTo(dataView: DataView, offset: number, value: boolean): number {
    dataView.setUint8(offset, value ? 1 : 0);
    return offset + 1;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: boolean; offset: number } {
    const raw = dataView.getUint8(offset);
    return { value: raw !== 0, offset: offset + 1 };
  }
}

export class Int16Schema extends Schema<number> {
  sizeOf(_: number): number {
    return 2;
  }

  encodeTo(dataView: DataView, offset: number, value: number): number {
    dataView.setInt16(offset, value, true);
    return offset + 2;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: number; offset: number } {
    const val = dataView.getInt16(offset, true);
    return { value: val, offset: offset + 2 };
  }
}

export class Int32Schema extends Schema<number> {
  sizeOf(_: number): number {
    return 4;
  }

  encodeTo(dataView: DataView, offset: number, value: number): number {
    dataView.setInt32(offset, value, true);
    return offset + 4;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: number; offset: number } {
    const val = dataView.getInt32(offset, true);
    return { value: val, offset: offset + 4 };
  }
}

export class Float32Schema extends Schema<number> {
  sizeOf(_: number): number {
    return 4;
  }

  encodeTo(dataView: DataView, offset: number, value: number): number {
    dataView.setFloat32(offset, value, true);
    return offset + 4;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: number; offset: number } {
    const val = dataView.getFloat32(offset, true);
    return { value: val, offset: offset + 4 };
  }
}

export class Float64Schema extends Schema<number> {
  sizeOf(_: number): number {
    return 8;
  }

  encodeTo(dataView: DataView, offset: number, value: number): number {
    dataView.setFloat64(offset, value, true);
    return offset + 8;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: number; offset: number } {
    const val = dataView.getFloat64(offset, true);
    return { value: val, offset: offset + 8 };
  }
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export class StringSchema extends Schema<string> {
  sizeOf(value: string): number {
    const bytes = TEXT_ENCODER.encode(value);
    return 4 + bytes.byteLength;
  }

  encodeTo(dataView: DataView, offset: number, value: string): number {
    const bytes = TEXT_ENCODER.encode(value);
    dataView.setUint32(offset, bytes.byteLength, true);
    let ptr = offset + 4;
    const u8 = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset + ptr,
      bytes.byteLength,
    );
    u8.set(bytes);
    return ptr + bytes.byteLength;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: string; offset: number } {
    const length = dataView.getUint32(offset, true);
    const start = offset + 4;
    const slice = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset + start,
      length,
    );
    const str = TEXT_DECODER.decode(slice);
    return { value: str, offset: start + length };
  }
}

export class ArraySchema<V> extends Schema<V[]> {
  constructor(private elementSchema: Schema<V>) {
    super();
  }

  sizeOf(value: this["$infer"]): number {
    let size = 4;
    for (const el of value) {
      size += this.elementSchema.sizeOf(el);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: this["$infer"]): number {
    dataView.setUint32(offset, value.length, true);
    let ptr = offset + 4;
    for (const el of value) {
      ptr = this.elementSchema.encodeTo(dataView, ptr, el);
    }
    return ptr;
  }

  decodeFrom(dataView: DataView, offset: number) {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const arr: this["$infer"] = [];
    for (let i = 0; i < length; i += 1) {
      const result = this.elementSchema.decodeFrom(dataView, ptr);
      arr.push(result.value);
      ptr = result.offset;
    }
    return { value: arr, offset: ptr };
  }
}

export class SetSchema<V> extends Schema<Set<V>> {
  constructor(private element: Schema<V>) {
    super();
  }

  sizeOf(value: this["$infer"]): number {
    let size = 4;
    for (const el of value) {
      size += this.element.sizeOf(el);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: this["$infer"]): number {
    dataView.setUint32(offset, value.size, true);
    let ptr = offset + 4;
    for (const el of value) {
      ptr = this.element.encodeTo(dataView, ptr, el);
    }
    return ptr;
  }

  decodeFrom(dataView: DataView, offset: number) {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const value: this["$infer"] = new Set<V>();
    for (let i = 0; i < length; i += 1) {
      const result = this.element.decodeFrom(dataView, ptr);
      value.add(result.value);
      ptr = result.offset;
    }
    return { value: value, offset: ptr };
  }
}

export class MapSchema<K, V> extends Schema<Map<K, V>> {
  constructor(
    private keySchema: Schema<K>,
    private valueSchema: Schema<V>,
  ) {
    super();
  }

  sizeOf(value: this["$infer"]): number {
    let size = 4;
    for (const [k, v] of value.entries()) {
      size += this.keySchema.sizeOf(k);
      size += this.valueSchema.sizeOf(v);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: this["$infer"]): number {
    dataView.setUint32(offset, value.size, true);
    let ptr = offset + 4;
    for (const [k, v] of value.entries()) {
      ptr = this.keySchema.encodeTo(dataView, ptr, k);
      ptr = this.valueSchema.encodeTo(dataView, ptr, v);
    }
    return ptr;
  }

  decodeFrom(dataView: DataView, offset: number) {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const value: this["$infer"] = new Map();
    for (let i = 0; i < length; i += 1) {
      const keyRes = this.keySchema.decodeFrom(dataView, ptr);
      ptr = keyRes.offset;
      const valRes = this.valueSchema.decodeFrom(dataView, ptr);
      ptr = valRes.offset;
      value.set(keyRes.value, valRes.value);
    }
    return { value: value, offset: ptr };
  }
}

export class OptionalSchema<V> extends Schema<V | undefined> {
  constructor(private inner: Schema<V>) {
    super();
  }

  sizeOf(value: V | undefined): number {
    return 1 + (value === undefined ? 0 : this.inner.sizeOf(value));
  }

  encodeTo(dataView: DataView, offset: number, value: V | undefined): number {
    if (value === undefined) {
      dataView.setUint8(offset, 0);
      return offset + 1;
    }
    dataView.setUint8(offset, 1);
    return this.inner.encodeTo(dataView, offset + 1, value);
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: V | undefined; offset: number } {
    const flag = dataView.getUint8(offset);
    if (flag === 0) {
      return { value: undefined, offset: offset + 1 };
    }
    const result = this.inner.decodeFrom(dataView, offset + 1);
    return { value: result.value, offset: result.offset };
  }
}

type PropertySchemas<T> = { [K in keyof T]: Schema<T[K]> };

export class ObjectSchema<T> extends Schema<T> {
  private sortedKeys: Array<keyof T>;
  constructor(
    private typeId: number,
    public readonly propertySchemas: PropertySchemas<T>,
  ) {
    super();
    this.sortedKeys = Object.keys(propertySchemas).sort() as Array<keyof T>;
  }

  sizeOf(value: this["$infer"]): number {
    let size = 2; // 2 bytes for type ID
    for (const key of this.sortedKeys) {
      const schema = this.propertySchemas[key];
      size += schema.sizeOf(value[key]);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: this["$infer"]): number {
    dataView.setUint16(offset, this.typeId, true);
    let ptr = offset + 2;
    for (const key of this.sortedKeys) {
      ptr = this.propertySchemas[key].encodeTo(dataView, ptr, value[key]);
    }
    return ptr;
  }

  decodeFrom(dataView: DataView, offset: number) {
    const typeId = dataView.getUint16(offset, true);
    if (typeId !== this.typeId) {
      throw new Error(
        `Type ID mismatch: expected ${this.typeId}, got ${typeId}`,
      );
    }
    let ptr = offset + 2;
    const result: this["$infer"] = {} as this["$infer"];
    for (const key of this.sortedKeys) {
      const res = this.propertySchemas[key].decodeFrom(dataView, ptr);
      result[key] = res.value as this["$infer"][typeof key];
      ptr = res.offset;
    }
    return { value: result, offset: ptr };
  }
}

// Function aliases

export function boolean(): BooleanSchema {
  return new BooleanSchema();
}
export function int16(): Int16Schema {
  return new Int16Schema();
}
export function int32(): Int32Schema {
  return new Int32Schema();
}
export function float32(): Float32Schema {
  return new Float32Schema();
}
export function float64(): Float64Schema {
  return new Float64Schema();
}
export function string(): StringSchema {
  return new StringSchema();
}
export function array<T>(element: Schema<T>): ArraySchema<T> {
  return new ArraySchema(element);
}
export function set<T>(element: Schema<T>): SetSchema<T> {
  return new SetSchema(element);
}
export function map<K, V>(key: Schema<K>, value: Schema<V>): MapSchema<K, V> {
  return new MapSchema(key, value);
}
export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  if (inner instanceof OptionalSchema) {
    return inner;
  }
  return new OptionalSchema(inner);
}
export function object<T>(
  typeId: number,
  propertySchemas: PropertySchemas<T>,
): ObjectSchema<T> {
  return new ObjectSchema(typeId, propertySchemas);
}
export function partial<T>(inner: ObjectSchema<T>): ObjectSchema<T> {
  throw new Error("Not implemnted");
}
