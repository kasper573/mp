const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export class WriteBuffer {
  #buf: ArrayBuffer;
  #view: DataView;
  #u8: Uint8Array;
  offset = 0;

  constructor(initial = 256) {
    this.#buf = new ArrayBuffer(initial);
    this.#view = new DataView(this.#buf);
    this.#u8 = new Uint8Array(this.#buf);
  }

  #grow(needed: number): void {
    const required = this.offset + needed;
    if (required <= this.#buf.byteLength) {
      return;
    }
    let size = this.#buf.byteLength;
    while (size < required) {
      size *= 2;
    }
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(this.#u8);
    this.#buf = next;
    this.#view = new DataView(this.#buf);
    this.#u8 = new Uint8Array(this.#buf);
  }

  writeBool(v: boolean): void {
    this.#grow(1);
    this.#view.setUint8(this.offset++, v ? 1 : 0);
  }

  writeU8(v: number): void {
    this.#grow(1);
    this.#view.setUint8(this.offset++, v);
  }

  writeU16(v: number): void {
    this.#grow(2);
    this.#view.setUint16(this.offset, v, true);
    this.offset += 2;
  }

  writeU32(v: number): void {
    this.#grow(4);
    this.#view.setUint32(this.offset, v, true);
    this.offset += 4;
  }

  writeI8(v: number): void {
    this.#grow(1);
    this.#view.setInt8(this.offset++, v);
  }

  writeI16(v: number): void {
    this.#grow(2);
    this.#view.setInt16(this.offset, v, true);
    this.offset += 2;
  }

  writeI32(v: number): void {
    this.#grow(4);
    this.#view.setInt32(this.offset, v, true);
    this.offset += 4;
  }

  writeF32(v: number): void {
    this.#grow(4);
    this.#view.setFloat32(this.offset, v, true);
    this.offset += 4;
  }

  writeF64(v: number): void {
    this.#grow(8);
    this.#view.setFloat64(this.offset, v, true);
    this.offset += 8;
  }

  writeString(v: string): void {
    const encoded = TEXT_ENCODER.encode(v);
    this.writeU16(encoded.byteLength);
    this.#grow(encoded.byteLength);
    this.#u8.set(encoded, this.offset);
    this.offset += encoded.byteLength;
  }

  writeU8At(offset: number, v: number): void {
    this.#view.setUint8(offset, v);
  }

  writeBytes(data: Uint8Array): void {
    this.#grow(data.byteLength);
    this.#u8.set(data, this.offset);
    this.offset += data.byteLength;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.#buf, 0, this.offset);
  }
}

export class ReadBuffer {
  #view: DataView;
  #u8: Uint8Array;
  offset = 0;

  constructor(buf: ArrayBuffer | Uint8Array) {
    if (buf instanceof Uint8Array) {
      this.#view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      this.#u8 = buf;
    } else {
      this.#view = new DataView(buf);
      this.#u8 = new Uint8Array(buf);
    }
  }

  get remaining(): number {
    return this.#u8.byteLength - this.offset;
  }

  readBool(): boolean {
    return this.#view.getUint8(this.offset++) !== 0;
  }

  readU8(): number {
    return this.#view.getUint8(this.offset++);
  }

  readU16(): number {
    const v = this.#view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readU32(): number {
    const v = this.#view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readI8(): number {
    return this.#view.getInt8(this.offset++);
  }

  readI16(): number {
    const v = this.#view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readI32(): number {
    const v = this.#view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readF32(): number {
    const v = this.#view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readF64(): number {
    const v = this.#view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  readString(): string {
    const len = this.readU16();
    const bytes = this.#u8.subarray(this.offset, this.offset + len);
    this.offset += len;
    return TEXT_DECODER.decode(bytes);
  }
}
