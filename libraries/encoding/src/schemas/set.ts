import { Schema } from "./abstract";

export class SetSchema<V> extends Schema<Set<V>> {
  constructor(public readonly valueSchema: Schema<V>) {
    super();
  }

  sizeOf(value: this["$infer"]): number {
    let size = 4;
    for (const el of value) {
      size += this.valueSchema.sizeOf(el);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: this["$infer"]): number {
    dataView.setUint32(offset, value.size, true);
    let ptr = offset + 4;
    for (const el of value) {
      ptr = this.valueSchema.encodeTo(dataView, ptr, el);
    }
    return ptr;
  }

  decodeFrom(dataView: DataView, offset: number) {
    const length = dataView.getUint32(offset, true);
    let ptr = offset + 4;
    const value: this["$infer"] = new Set<V>();
    for (let i = 0; i < length; i += 1) {
      const result = this.valueSchema.decodeFrom(dataView, ptr);
      value.add(result.value);
      ptr = result.offset;
    }
    return { value: value, offset: ptr };
  }
}

export function set<T>(element: Schema<T>): SetSchema<T> {
  return new SetSchema(element);
}
