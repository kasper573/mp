import { Schema } from "./abstract";

export class RecordSchema<K extends string | number, V> extends Schema<
  Record<K, V>
> {
  constructor(
    public readonly keySchema: Schema<K>,
    public readonly valueSchema: Schema<V>,
  ) {
    super();
  }

  sizeOf(value: Record<K, V>): number {
    let size = 4;
    for (const [k, v] of Object.entries(value)) {
      size += this.keySchema.sizeOf(k as K);
      size += this.valueSchema.sizeOf(v as V);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: Record<K, V>): number {
    const length = Object.keys(value).length;
    dataView.setUint32(offset, length, true);
    let ptr = offset + 4;
    for (const [k, v] of Object.entries(value)) {
      ptr = this.keySchema.encodeTo(dataView, ptr, k as K);
      ptr = this.valueSchema.encodeTo(dataView, ptr, v as V);
    }
    return ptr;
  }

  decodeFrom(dataView: DataView, offset: number) {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const record = {} as Record<K, V>;
    for (let i = 0; i < length; i += 1) {
      const keyRes = this.keySchema.decodeFrom(dataView, ptr);
      ptr = keyRes.offset;
      const valRes = this.valueSchema.decodeFrom(dataView, ptr);
      ptr = valRes.offset;
      record[keyRes.value] = valRes.value;
    }
    return { value: record, offset: ptr };
  }
}

export function record<K extends string | number, V>(
  key: Schema<K>,
  value: Schema<V>,
): RecordSchema<K, V> {
  return new RecordSchema(key, value);
}
