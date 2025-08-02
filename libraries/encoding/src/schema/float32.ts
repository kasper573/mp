import { Schema } from "./abstract";

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

export function float32(): Float32Schema {
  return new Float32Schema();
}
