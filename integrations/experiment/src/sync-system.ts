import type { ObjectSchema } from "@mp/encoding/schema";
import type { SyncEntityMapRecord } from "./create-entity-map";
import { createEntityMap } from "./create-entity-map";
import type { Patch } from "./patch-system";
import { PatchSystem } from "./patch-system";

export class SyncSystem<State> {
  readonly controls = {} as SyncEntityMapRecord<State>;
  #patchSystem: PatchSystem<State>;

  constructor(private entitySchemas: SyncSchema<State>) {
    for (const entityName in entitySchemas) {
      this.controls[entityName] = createEntityMap(entitySchemas[entityName]);
    }
    this.#patchSystem = new PatchSystem(this.controls);
  }

  flush(): Patch {
    const patch = this.#patchSystem.createPatch();
    return patch;
  }

  update(patch: Patch) {
    this.#patchSystem.applyPatch(patch);
  }
}

export type SyncSchema<State> = {
  [EntityName in keyof State]: ObjectSchema<State[EntityName]>;
};
