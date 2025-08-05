import type { Schema } from "@mp/encoding/schema";
import type { SyncEntityMapRecord } from "./create-entity-map";
import { createEntityMap } from "./create-entity-map";
import { createPatchEncoding, type SyncSchema } from "./patch-encoding";
import type { Patch } from "./patcher";
import { Patcher } from "./patcher";
import type { SchemaAnalysis } from "./schema-analysis";
import { analyzeSchema } from "./schema-analysis";

export class SyncSystem<State> {
  readonly entities = {} as SyncEntityMapRecord<State>;
  #patcher: Patcher<State>;
  #encoding: Schema<Patch>;

  constructor(schema: SyncSchema<State>) {
    const analyses: Record<string, SchemaAnalysis> = {};
    for (const entityName in schema) {
      const analysis = analyzeSchema(schema[entityName]);
      this.entities[entityName] = createEntityMap(analysis.shape);
    }
    this.#patcher = new Patcher(this.entities);
    this.#encoding = createPatchEncoding(1, analyses);
  }

  flush(): Uint8Array | undefined {
    const patch = this.#patcher.createPatch();
    if (patch.length) {
      return this.#encoding.encode(patch);
    }
  }

  update(encodedPatch?: Uint8Array) {
    if (encodedPatch) {
      const patch = this.#encoding.decode(encodedPatch);
      this.#patcher.applyPatch(patch);
    }
  }
}
