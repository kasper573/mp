import { Schema } from "./abstract";

export class ObjectSchema<T> extends Schema<T> {
  private sortedKeys: Array<keyof T>;
  constructor(
    public readonly typeId: number,
    public readonly propertySchemas: PropertySchemas<T>,
  ) {
    super();
    this.sortedKeys = Object.keys(propertySchemas).sort() as Array<keyof T>;
  }

  sizeOf(value: this["$infer"]): number {
    let size = 2; // 2 bytes for type ID
    for (const key of this.sortedKeys) {
      const schema = this.propertySchemas[key];
      size += schema.sizeOf(value[key]);
    }
    return size;
  }

  encodeTo(dataView: DataView, offset: number, value: this["$infer"]): number {
    dataView.setUint16(offset, this.typeId, true);
    let ptr = offset + 2;
    for (const key of this.sortedKeys) {
      ptr = this.propertySchemas[key].encodeTo(dataView, ptr, value[key]);
    }
    return ptr;
  }

  decodeFrom(dataView: DataView, offset: number) {
    const typeId = dataView.getUint16(offset, true);
    if (typeId !== this.typeId) {
      throw new Error(
        `Type ID mismatch: expected ${this.typeId}, got ${typeId}`,
      );
    }
    let ptr = offset + 2;
    const result: this["$infer"] = {} as this["$infer"];
    for (const key of this.sortedKeys) {
      const res = this.propertySchemas[key].decodeFrom(dataView, ptr);
      result[key] = res.value as this["$infer"][typeof key];
      ptr = res.offset;
    }
    return { value: result, offset: ptr };
  }
}

export type PropertySchemas<T> = {
  [K in keyof T]: Schema<T[K]>;
};

export function object<T>(
  typeId: number,
  propertySchemas: PropertySchemas<T>,
): ObjectSchema<T> {
  return new ObjectSchema(typeId, propertySchemas);
}
