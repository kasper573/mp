import { Schema } from "./abstract";

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

export function float64(): Float64Schema {
  return new Float64Schema();
}
