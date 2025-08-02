export abstract class Schema<V> {
  abstract sizeOf(value: V): number;
  abstract encodeTo(dataView: DataView, offset: number, value: V): number;
  abstract decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: V; offset: number };

  get $infer(): V {
    throw new Error(
      "This should not be used at runtime. It exists only for type inference.",
    );
  }

  encode(value: V): Uint8Array {
    const length = this.sizeOf(value);
    const buffer = new ArrayBuffer(length);
    const dv = new DataView(buffer);
    this.encodeTo(dv, 0, value);
    return new Uint8Array(buffer);
  }

  decode(buffer: Uint8Array): V {
    const dv = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const result = this.decodeFrom(dv, 0);
    return result.value;
  }
}
