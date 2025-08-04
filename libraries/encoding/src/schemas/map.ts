import { Schema } from "./abstract";

export class MapSchema<K, V> extends Schema<Map<K, V>> {
  constructor(
    public readonly keySchema: Schema<K>,
    public readonly valueSchema: Schema<V>,
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

export function map<K, V>(key: Schema<K>, value: Schema<V>): MapSchema<K, V> {
  return new MapSchema(key, value);
}
