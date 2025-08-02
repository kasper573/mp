import { Schema } from "./abstract";

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

export function int32(): Int32Schema {
  return new Int32Schema();
}
