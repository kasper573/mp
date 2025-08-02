/*
 * High-Performance Binary Schema Encoder/Decoder
 * No use of `any`, no non-null assertions, flat binary packing via DataView
 */

// -----------------------------------------------------------------------------
// Core Schema Abstractions
// -----------------------------------------------------------------------------

export abstract class Schema<T> {
  /** Compute byte length required to encode value */
  abstract sizeOf(value: T): number;
  /** Encode value into DataView at offset, return new offset */
  abstract encodeTo(dataView: DataView, offset: number, value: T): number;
  /** Decode value from DataView at offset, return value and new offset */
  abstract decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: T; offset: number };
  /** Type inference placeholder */
  get infer(): T {
    throw new Error("Not for runtime");
  }

  /** Two-pass encode: compute size, allocate buffer, write, return Uint8Array */
  encode(value: T): Uint8Array {
    const length = this.sizeOf(value);
    const buffer = new ArrayBuffer(length);
    const dv = new DataView(buffer);
    this.encodeTo(dv, 0, value);
    return new Uint8Array(buffer);
  }

  /** Top-level decode: wrap Uint8Array in DataView, read entire object */
  decode(buffer: Uint8Array): T {
    const dv = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const result = this.decodeFrom(dv, 0);
    return result.value;
  }
}

// -----------------------------------------------------------------------------
// Registry for Object Schemas (assigns unique type IDs)
// -----------------------------------------------------------------------------

let nextObjectTypeId = 1;
const objectSchemaRegistry = new Map<number, ObjectSchema<AnySchemaRecord>>();

function registerObject<T extends AnySchemaRecord>(
  schema: ObjectSchema<T>,
): number {
  const id = nextObjectTypeId;
  nextObjectTypeId += 1;
  objectSchemaRegistry.set(id, schema);
  return id;
}

function getObjectSchema<T extends AnySchemaRecord>(
  id: number,
): ObjectSchema<T> {
  const schema = objectSchemaRegistry.get(id);
  if (schema === undefined) {
    throw new Error(`Unknown object type id: ${id}`);
  }
  return schema as ObjectSchema<T>;
}

// -----------------------------------------------------------------------------
// Primitive Type Schemas
// -----------------------------------------------------------------------------

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

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

export class ShortSchema extends Schema<number> {
  sizeOf(_: number): number {
    return 2;
  }

  encodeTo(dataView: DataView, offset: number, value: number): number {
    dataView.setUint16(offset, value, true);
    return offset + 2;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: number; offset: number } {
    const val = dataView.getUint16(offset, true);
    return { value: val, offset: offset + 2 };
  }
}

export class LongSchema extends Schema<bigint> {
  sizeOf(_: bigint): number {
    return 8;
  }

  encodeTo(dataView: DataView, offset: number, value: bigint): number {
    dataView.setBigInt64(offset, value, true);
    return offset + 8;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: bigint; offset: number } {
    const val = dataView.getBigInt64(offset, true);
    return { value: val, offset: offset + 8 };
  }
}

export class FloatSchema extends Schema<number> {
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

export class StringSchema extends Schema<string> {
  sizeOf(value: string): number {
    const bytes = TEXT_ENCODER.encode(value);
    return 4 + bytes.byteLength;
  }

  encodeTo(dataView: DataView, offset: number, value: string): number {
    const bytes = TEXT_ENCODER.encode(value);
    dataView.setUint32(offset, bytes.byteLength, true);
    let ptr = offset + 4;
    const u8 = new Uint8Array(dataView.buffer);
    u8.set(bytes, ptr);
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

// -----------------------------------------------------------------------------
// Composite Schemas: array, set, map, optional
// -----------------------------------------------------------------------------

export class ArraySchema<T> extends Schema<T[]> {
  constructor(private element: Schema<T>) {
    super();
  }

  sizeOf(value: T[]): number {
    let size = 4;
    for (const el of value) {
      size += this.element.sizeOf(el);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: T[]): number {
    dataView.setUint32(offset, value.length, true);
    let ptr = offset + 4;
    for (const el of value) {
      ptr = this.element.encodeTo(dataView, ptr, el);
    }
    return ptr;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: T[]; offset: number } {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const arr: T[] = [];
    for (let i = 0; i < length; i += 1) {
      const result = this.element.decodeFrom(dataView, ptr);
      arr.push(result.value);
      ptr = result.offset;
    }
    return { value: arr, offset: ptr };
  }
}

export class SetSchema<T> extends Schema<Set<T>> {
  constructor(private element: Schema<T>) {
    super();
  }

  sizeOf(value: Set<T>): number {
    let size = 4;
    for (const el of value) {
      size += this.element.sizeOf(el);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: Set<T>): number {
    dataView.setUint32(offset, value.size, true);
    let ptr = offset + 4;
    for (const el of value) {
      ptr = this.element.encodeTo(dataView, ptr, el);
    }
    return ptr;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: Set<T>; offset: number } {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const resultSet = new Set<T>();
    for (let i = 0; i < length; i += 1) {
      const result = this.element.decodeFrom(dataView, ptr);
      resultSet.add(result.value);
      ptr = result.offset;
    }
    return { value: resultSet, offset: ptr };
  }
}

export class MapSchema<K, V> extends Schema<Map<K, V>> {
  constructor(
    private keySchema: Schema<K>,
    private valueSchema: Schema<V>,
  ) {
    super();
  }

  sizeOf(value: Map<K, V>): number {
    let size = 4;
    for (const [k, v] of value.entries()) {
      size += this.keySchema.sizeOf(k);
      size += this.valueSchema.sizeOf(v);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: Map<K, V>): number {
    dataView.setUint32(offset, value.size, true);
    let ptr = offset + 4;
    for (const [k, v] of value.entries()) {
      ptr = this.keySchema.encodeTo(dataView, ptr, k);
      ptr = this.valueSchema.encodeTo(dataView, ptr, v);
    }
    return ptr;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: Map<K, V>; offset: number } {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const resultMap = new Map<K, V>();
    for (let i = 0; i < length; i += 1) {
      const keyRes = this.keySchema.decodeFrom(dataView, ptr);
      ptr = keyRes.offset;
      const valRes = this.valueSchema.decodeFrom(dataView, ptr);
      ptr = valRes.offset;
      resultMap.set(keyRes.value, valRes.value);
    }
    return { value: resultMap, offset: ptr };
  }
}

export class OptionalSchema<T> extends Schema<T | undefined> {
  constructor(private inner: Schema<T>) {
    super();
  }

  sizeOf(value: T | undefined): number {
    return 1 + (value === undefined ? 0 : this.inner.sizeOf(value));
  }

  encodeTo(dataView: DataView, offset: number, value: T | undefined): number {
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
  ): { value: T | undefined; offset: number } {
    const flag = dataView.getUint8(offset);
    if (flag === 0) {
      return { value: undefined, offset: offset + 1 };
    }
    const result = this.inner.decodeFrom(dataView, offset + 1);
    return { value: result.value, offset: result.offset };
  }
}

// -----------------------------------------------------------------------------
// Object Schema (with type ID header)
// -----------------------------------------------------------------------------

type AnySchemaRecord = Record<string, Schema<unknown>>;

type InferProps<P extends AnySchemaRecord> = {
  [K in keyof P]: P[K] extends Schema<infer U> ? U : never;
};

export class ObjectSchema<P extends AnySchemaRecord> extends Schema<
  InferProps<P>
> {
  readonly props: P;
  private readonly typeId: number;

  constructor(props: P) {
    super();
    this.props = props;
    this.typeId = registerObject(this);
  }

  sizeOf(value: InferProps<P>): number {
    // 2 bytes for type ID
    let size = 2;
    for (const key of Object.keys(this.props) as Array<keyof P>) {
      const schema = this.props[key];
      size += schema.sizeOf(value[key as string]);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: InferProps<P>): number {
    dataView.setUint16(offset, this.typeId, true);
    let ptr = offset + 2;
    for (const key of Object.keys(this.props) as Array<keyof P>) {
      ptr = this.props[key].encodeTo(dataView, ptr, value[key as string]);
    }
    return ptr;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: InferProps<P>; offset: number } {
    const typeId = dataView.getUint16(offset, true);
    const schema = getObjectSchema<P>(typeId);
    let ptr = offset + 2;
    const result = {} as InferProps<P>;
    for (const key in schema.props) {
      const res = schema.props[key].decodeFrom(dataView, ptr);
      result[key as keyof InferProps<P>] = res.value as InferProps<P>[keyof P];
      ptr = res.offset;
    }
    return { value: result, offset: ptr };
  }
}

// -----------------------------------------------------------------------------
// Factory Aliases
// -----------------------------------------------------------------------------

export function boolean(): BooleanSchema {
  return new BooleanSchema();
}
export function short(): ShortSchema {
  return new ShortSchema();
}
export function long(): LongSchema {
  return new LongSchema();
}
export function float(): FloatSchema {
  return new FloatSchema();
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
  return new OptionalSchema(inner);
}
export function object<P extends AnySchemaRecord>(props: P): ObjectSchema<P> {
  return new ObjectSchema(props);
}
