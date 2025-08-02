import { Schema } from "./abstract";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export class StringSchema extends Schema<string> {
  sizeOf(value: string): number {
    const bytes = TEXT_ENCODER.encode(value);
    return 4 + bytes.byteLength;
  }

  encodeTo(dataView: DataView, offset: number, value: string): number {
    const bytes = TEXT_ENCODER.encode(value);
    dataView.setUint32(offset, bytes.byteLength, true);
    let ptr = offset + 4;
    const u8 = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset + ptr,
      bytes.byteLength,
    );
    u8.set(bytes);
    return ptr + bytes.byteLength;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: string; offset: number } {
    const length = dataView.getUint32(offset, true);
    const start = offset + 4;
    const slice = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset + start,
      length,
    );
    const str = TEXT_DECODER.decode(slice);
    return { value: str, offset: start + length };
  }
}

export function string(): StringSchema {
  return new StringSchema();
}
