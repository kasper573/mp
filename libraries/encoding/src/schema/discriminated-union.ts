import { Schema } from "./abstract";
import type { ObjectSchema } from "./object";

type UnionType<Schemas extends AnyUnionSchemaTuple> = Schemas[number]["$infer"];

// oxlint-disable-next-line no-explicit-any
type AnyUnionSchemaTuple = readonly [...ObjectSchema<any>[]];

type DiscriminatorFor<Schemas extends AnyUnionSchemaTuple> =
  keyof UnionType<Schemas>;

export class DiscriminatedUnionSchema<
  VariantSchemas extends AnyUnionSchemaTuple,
  Discriminator extends DiscriminatorFor<VariantSchemas>,
> extends Schema<UnionType<VariantSchemas>> {
  private schemaByTypeId: Map<number, ObjectSchema<unknown>>;

  constructor(
    schemas: VariantSchemas,
    private discriminator: Discriminator,
  ) {
    super();
    this.schemaByTypeId = new Map();
    for (const schema of schemas) {
      if (this.schemaByTypeId.has(schema.typeId)) {
        throw new Error(`Duplicate typeId ${schema.typeId} in union variants.`);
      }
      this.schemaByTypeId.set(schema.typeId, schema);
    }
  }

  private getVariantSchema(value: this["$infer"]) {
    const discVal = value[this.discriminator] as number;
    const schema = this.schemaByTypeId.get(discVal);
    if (!schema) {
      throw new Error(
        `No matching variant for discriminator value: ${discVal}`,
      );
    }
    return schema;
  }

  sizeOf(value: this["$infer"]): number {
    return this.getVariantSchema(value).sizeOf(value);
  }

  encodeTo(dataView: DataView, offset: number, value: this["$infer"]): number {
    return this.getVariantSchema(value).encodeTo(dataView, offset, value);
  }

  decodeFrom(dataView: DataView, offset: number) {
    const typeId = dataView.getUint16(offset, true);
    const schema = this.schemaByTypeId.get(typeId);
    if (!schema) {
      throw new Error(`Unknown variant with typeId: ${typeId}`);
    }
    const decoded = schema.decodeFrom(dataView, offset);
    return {
      value: decoded.value as this["$infer"],
      offset: decoded.offset,
    };
  }
}

export function discriminatedUnion<
  VariantSchemas extends AnyUnionSchemaTuple,
  Discriminator extends DiscriminatorFor<VariantSchemas>,
>(
  schemas: VariantSchemas,
  discriminator: Discriminator,
): DiscriminatedUnionSchema<VariantSchemas, Discriminator> {
  return new DiscriminatedUnionSchema(schemas, discriminator);
}
