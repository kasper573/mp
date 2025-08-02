import { Schema } from "./abstract";

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

export function boolean(): BooleanSchema {
  return new BooleanSchema();
}
