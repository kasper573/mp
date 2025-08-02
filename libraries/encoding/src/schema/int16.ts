import { Schema } from "./abstract";

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

export function int16(): Int16Schema {
  return new Int16Schema();
}
