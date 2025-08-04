import { Schema } from "./abstract";

export class OptionalSchema<V> extends Schema<V | undefined> {
  constructor(public readonly valueSchema: Schema<V>) {
    super();
  }

  sizeOf(value: V | undefined): number {
    return 1 + (value === undefined ? 0 : this.valueSchema.sizeOf(value));
  }

  encodeTo(dataView: DataView, offset: number, value: V | undefined): number {
    if (value === undefined) {
      dataView.setUint8(offset, 0);
      return offset + 1;
    }
    dataView.setUint8(offset, 1);
    return this.valueSchema.encodeTo(dataView, offset + 1, value);
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: V | undefined; offset: number } {
    const flag = dataView.getUint8(offset);
    if (flag === 0) {
      return { value: undefined, offset: offset + 1 };
    }
    const result = this.valueSchema.decodeFrom(dataView, offset + 1);
    return { value: result.value, offset: result.offset };
  }
}

export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  if (inner instanceof OptionalSchema) {
    return inner;
  }
  return new OptionalSchema(inner);
}
