import type { ObjectSchema, PropertySchemas } from "@mp/encoding/schema";
import {
  array,
  object,
  optional,
  Schema,
  set,
  string,
} from "@mp/encoding/schema";
import SuperJSON from "superjson";
import type { FlatEntityRecord } from "./create-entity-map";
import type { Operation, Patch } from "./patcher";
import type { SchemaAnalysis } from "./schema-analysis";

export function createPatchEncoding(
  objectIdOffset: number,
  schemaAnalyses: { [entityName: string]: SchemaAnalysis },
): Schema<Patch> {
  return new JSONSchema<Patch>();

  const changesSchemas: PropertySchemas<FlatEntityRecord> = {};
  for (const entityName in schemaAnalyses) {
    changesSchemas[entityName] = object(
      ++objectIdOffset,
      schemaAnalyses[entityName].flat,
    );
  }
  return array(
    object<Operation>(++objectIdOffset, {
      entityName: string(),
      changes: optional(object(++objectIdOffset, changesSchemas)),
      removedIds: optional(set(string())),
    }),
  );
}

export type SyncSchema<State> = {
  [EntityName in keyof State]: ObjectSchema<State[EntityName]>;
};

class JSONSchema<T> extends Schema<T> {
  override sizeOf(value: T): number {
    throw new Error("Method not implemented.");
  }
  override encodeTo(dataView: DataView, offset: number, value: T): number {
    throw new Error("Method not implemented.");
  }
  override decodeFrom(
    dataView: DataView,
    offset: number,
  ): { value: T; offset: number } {
    throw new Error("Method not implemented.");
  }

  override encode(value: T): Uint8Array {
    return new TextEncoder().encode(SuperJSON.stringify(value));
  }

  override decode(buffer: Uint8Array): T {
    const str = new TextDecoder().decode(buffer);
    try {
      return SuperJSON.parse(str);
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`);
    }
  }
}
