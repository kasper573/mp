const utf8 = new TextEncoder();

export class Writer {
  #buf: Uint8Array;
  #view: DataView;
  #offset = 0;

  constructor(capacity = 256) {
    this.#buf = new Uint8Array(capacity);
    this.#view = new DataView(this.#buf.buffer);
  }

  get offset(): number {
    return this.#offset;
  }

  #reserve(n: number): void {
    const need = this.#offset + n;
    if (need <= this.#buf.byteLength) {
      return;
    }
    let cap = this.#buf.byteLength;
    while (cap < need) {
      cap *= 2;
    }
    const next = new Uint8Array(cap);
    next.set(this.#buf);
    this.#buf = next;
    this.#view = new DataView(next.buffer);
  }

  writeU8(v: number): void {
    this.#reserve(1);
    this.#view.setUint8(this.#offset, v);
    this.#offset += 1;
  }

  writeU16(v: number): void {
    this.#reserve(2);
    this.#view.setUint16(this.#offset, v, true);
    this.#offset += 2;
  }

  writeU32(v: number): void {
    this.#reserve(4);
    this.#view.setUint32(this.#offset, v, true);
    this.#offset += 4;
  }

  writeU64(v: bigint): void {
    this.#reserve(8);
    this.#view.setBigUint64(this.#offset, v, true);
    this.#offset += 8;
  }

  writeI8(v: number): void {
    this.#reserve(1);
    this.#view.setInt8(this.#offset, v);
    this.#offset += 1;
  }

  writeI16(v: number): void {
    this.#reserve(2);
    this.#view.setInt16(this.#offset, v, true);
    this.#offset += 2;
  }

  writeI32(v: number): void {
    this.#reserve(4);
    this.#view.setInt32(this.#offset, v, true);
    this.#offset += 4;
  }

  writeI64(v: bigint): void {
    this.#reserve(8);
    this.#view.setBigInt64(this.#offset, v, true);
    this.#offset += 8;
  }

  writeF32(v: number): void {
    this.#reserve(4);
    this.#view.setFloat32(this.#offset, v, true);
    this.#offset += 4;
  }

  writeF64(v: number): void {
    this.#reserve(8);
    this.#view.setFloat64(this.#offset, v, true);
    this.#offset += 8;
  }

  writeBool(v: boolean): void {
    this.writeU8(v ? 1 : 0);
  }

  writeVarU32(v: number): void {
    let value = v >>> 0;
    while (value >= 0x80) {
      this.writeU8((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    this.writeU8(value);
  }

  writeBytesRaw(data: Uint8Array): void {
    this.#reserve(data.byteLength);
    this.#buf.set(data, this.#offset);
    this.#offset += data.byteLength;
  }

  writeLen(n: number, widthBytes: 1 | 2 | 4): void {
    if (widthBytes === 1) {
      this.writeU8(n);
    } else if (widthBytes === 2) {
      this.writeU16(n);
    } else {
      this.writeU32(n);
    }
  }

  writeString(s: string): void {
    const bytes = utf8.encode(s);
    this.writeU32(bytes.byteLength);
    this.writeBytesRaw(bytes);
  }

  writeBytes(data: Uint8Array): void {
    this.writeU32(data.byteLength);
    this.writeBytesRaw(data);
  }

  finish(): Uint8Array<ArrayBuffer> {
    return this.#buf.slice(0, this.#offset);
  }
}
