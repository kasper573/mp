import { Schema } from "./abstract";
import type { ObjectSchema, PropertySchemas } from "./object";

export class PartialObjectSchema<T> extends Schema<Partial<T>> {
  private propertySchemas: PropertySchemas<T>;
  private sortedKeys: Array<keyof T>;
  private typeId: number;
  private bitsetSize: number;

  constructor({ typeId, propertySchemas }: ObjectSchema<T>) {
    super();
    this.propertySchemas = propertySchemas;
    this.sortedKeys = Object.keys(propertySchemas).sort() as Array<keyof T>;
    this.typeId = typeId;
    // Number of bytes needed to store presence bits
    this.bitsetSize = Math.ceil(this.sortedKeys.length / 8);
  }

  sizeOf(value: Partial<T>): number {
    // 2 bytes for typeId + bitset bytes + sizes of present fields
    let size = 2 + this.bitsetSize;
    for (const key of this.sortedKeys) {
      const v = value[key];
      if (v !== undefined) {
        size += this.propertySchemas[key].sizeOf(v as T[typeof key]);
      }
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: Partial<T>): number {
    // Write type ID
    dataView.setUint16(offset, this.typeId, true);
    let ptr = offset + 2;

    // Build and write presence bitset
    const bitset = new Uint8Array(this.bitsetSize);
    for (let idx = 0; idx < this.sortedKeys.length; idx++) {
      const key = this.sortedKeys[idx];
      if (value[key] !== undefined) {
        const byteIndex = idx >> 3;
        const bitIndex = idx & 7;
        bitset[byteIndex] |= 1 << bitIndex;
      }
    }
    for (let i = 0; i < this.bitsetSize; i++) {
      dataView.setUint8(ptr + i, bitset[i]);
    }
    ptr += this.bitsetSize;

    // Encode each present property in order
    for (const key of this.sortedKeys) {
      const v = value[key];
      if (v !== undefined) {
        ptr = this.propertySchemas[key].encodeTo(
          dataView,
          ptr,
          v as T[typeof key],
        );
      }
    }
    return ptr;
  }

  decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: Partial<T>; offset: number } {
    // Read and verify type ID
    const readTypeId = dataView.getUint16(offset, true);
    if (readTypeId !== this.typeId) {
      throw new Error(
        `Type ID mismatch: expected ${this.typeId}, got ${readTypeId}`,
      );
    }
    let ptr = offset + 2;

    // Read presence bitset
    const bitset = new Uint8Array(this.bitsetSize);
    for (let i = 0; i < this.bitsetSize; i++) {
      bitset[i] = dataView.getUint8(ptr + i);
    }
    ptr += this.bitsetSize;

    // Decode each present property
    const result: Partial<T> = {};
    for (let idx = 0; idx < this.sortedKeys.length; idx++) {
      const key = this.sortedKeys[idx];
      const byteIndex = idx >> 3;
      const bitIndex = idx & 7;
      if (bitset[byteIndex] & (1 << bitIndex)) {
        const res = this.propertySchemas[key].decodeFrom(dataView, ptr);
        result[key] = res.value as T[typeof key];
        ptr = res.offset;
      }
    }
    return { value: result, offset: ptr };
  }
}

export function partial<T>(objectSchema: ObjectSchema<T>): Schema<Partial<T>> {
  return new PartialObjectSchema(objectSchema);
}
