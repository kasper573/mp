const utf8 = new TextDecoder("utf-8");

export class Reader {
  #buf: Uint8Array;
  #view: DataView;
  #offset: number;

  constructor(buf: Uint8Array, offset = 0) {
    this.#buf = buf;
    this.#view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.#offset = offset;
  }

  get offset(): number {
    return this.#offset;
  }

  get remaining(): number {
    return this.#buf.byteLength - this.#offset;
  }

  skip(n: number): void {
    this.#offset += n;
  }

  readU8(): number {
    const v = this.#view.getUint8(this.#offset);
    this.#offset += 1;
    return v;
  }

  readU16(): number {
    const v = this.#view.getUint16(this.#offset, true);
    this.#offset += 2;
    return v;
  }

  readU32(): number {
    const v = this.#view.getUint32(this.#offset, true);
    this.#offset += 4;
    return v;
  }

  readU64(): bigint {
    const v = this.#view.getBigUint64(this.#offset, true);
    this.#offset += 8;
    return v;
  }

  readI8(): number {
    const v = this.#view.getInt8(this.#offset);
    this.#offset += 1;
    return v;
  }

  readI16(): number {
    const v = this.#view.getInt16(this.#offset, true);
    this.#offset += 2;
    return v;
  }

  readI32(): number {
    const v = this.#view.getInt32(this.#offset, true);
    this.#offset += 4;
    return v;
  }

  readI64(): bigint {
    const v = this.#view.getBigInt64(this.#offset, true);
    this.#offset += 8;
    return v;
  }

  readF32(): number {
    const v = this.#view.getFloat32(this.#offset, true);
    this.#offset += 4;
    return v;
  }

  readF64(): number {
    const v = this.#view.getFloat64(this.#offset, true);
    this.#offset += 8;
    return v;
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readVarU32(): number {
    let result = 0;
    let shift = 0;
    while (shift < 35) {
      const byte = this.readU8();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return result >>> 0;
      }
      shift += 7;
    }
    throw new Error("varint too long");
  }

  readBytesRaw(n: number): Uint8Array {
    const slice = this.#buf.slice(this.#offset, this.#offset + n);
    this.#offset += n;
    return slice;
  }

  readLen(widthBytes: 1 | 2 | 4): number {
    if (widthBytes === 1) {
      return this.readU8();
    }
    if (widthBytes === 2) {
      return this.readU16();
    }
    return this.readU32();
  }

  readString(): string {
    const n = this.readU32();
    const view = new Uint8Array(
      this.#buf.buffer,
      this.#buf.byteOffset + this.#offset,
      n,
    );
    this.#offset += n;
    return utf8.decode(view);
  }

  readBytes(): Uint8Array {
    const n = this.readU32();
    return this.readBytesRaw(n);
  }
}
