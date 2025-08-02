import { Schema } from "./abstract";

export class ArraySchema<V> extends Schema<V[]> {
  constructor(public readonly elementSchema: Schema<V>) {
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

export function array<T>(element: Schema<T>): ArraySchema<T> {
  return new ArraySchema(element);
}
