import type { Entity } from "@rift/core";
import { defineModule } from "@rift/modular";
import type { PersistenceSchema } from "@rift/persistence";
import type { RiftPersistence } from "@rift/persistence/server";
import { PersistenceId } from "@rift/persistence";
import {
  Appearance,
  AreaMember,
  CharacterMeta,
  Health,
  Position,
} from "../../components";
import { CharacterModule } from "../character/module";

export const CHARACTERS_COLLECTION = "characters";

export function buildWorldPersistenceSchema(args: {
  instanceId: string;
  dbPath: string;
  saveInterval?: number;
  pollInterval?: number;
  leaseDurationMs?: number;
}): PersistenceSchema {
  return {
    instanceId: args.instanceId,
    dbPath: args.dbPath,
    saveInterval: args.saveInterval,
    pollInterval: args.pollInterval,
    collections: {
      [CHARACTERS_COLLECTION]: {
        keyComponent: PersistenceId,
        components: [CharacterMeta, Position, Health, Appearance, AreaMember],
        mode: "session",
        leaseDurationMs: args.leaseDurationMs,
      },
    },
  };
}

export interface PersistenceApi {
  activateCharacter(entity: Entity): boolean;
  deactivateCharacter(entity: Entity): void;
  persistNow(): void;
}

declare module "@rift/modular" {
  interface ServerContextValues {
    worldPersistence?: RiftPersistence;
  }
}

export const PersistenceModule = defineModule({
  dependencies: [CharacterModule] as const,
  server: (ctx): { api: PersistenceApi } => {
    const persistence = ctx.values.worldPersistence;
    if (!persistence) {
      throw new Error(
        "PersistenceModule requires ServerContextValues.worldPersistence",
      );
    }

    const activateCharacter: PersistenceApi["activateCharacter"] = (entity) => {
      if (!entity.has(CharacterMeta)) {
        throw new Error("activateCharacter requires CharacterMeta component");
      }
      if (!entity.has(PersistenceId)) {
        entity.set(
          PersistenceId,
          entity.get(CharacterMeta).characterId as never,
        );
      }
      return persistence.activateSessionEntity(CHARACTERS_COLLECTION, entity);
    };

    const deactivateCharacter: PersistenceApi["deactivateCharacter"] = (
      entity,
    ) => {
      persistence.deactivateSessionEntity(CHARACTERS_COLLECTION, entity);
    };

    const persistNow: PersistenceApi["persistNow"] = () => {
      persistence.persist();
    };

    ctx.onTick(() => {
      persistence.persist();
    });

    return { api: { activateCharacter, deactivateCharacter, persistNow } };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});
