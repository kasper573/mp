import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { UserId } from "@mp/auth";
import { RiftServer, RiftWorld } from "@rift/core";
import { PersistenceId } from "@rift/persistence";
import { RiftPersistence } from "@rift/persistence/server";
import {
  buildCharacterMetadataPersistenceSchema,
  CharacterIdentity,
  type AreaId,
  type CharacterId,
} from "@mp/world";

export interface CharacterMirror {
  resolveAreaForUser(
    userId: UserId,
    characterId: CharacterId,
  ): AreaId | undefined;
  dispose(): void;
}

export function createCharacterMirror(args: {
  instanceId: string;
  dbPath: string;
}): CharacterMirror {
  mkdirSync(dirname(args.dbPath), { recursive: true });
  const world = new RiftWorld({
    components: [PersistenceId, CharacterIdentity],
    events: [],
  });
  const rift = new RiftServer(world);
  const persistence = new RiftPersistence(
    rift,
    buildCharacterMetadataPersistenceSchema({
      instanceId: args.instanceId,
      dbPath: args.dbPath,
    }),
  );
  persistence.start();

  return {
    resolveAreaForUser(userId, characterId) {
      persistence.poll();
      for (const entity of rift.query(PersistenceId, CharacterIdentity).value) {
        const key = entity.get(PersistenceId) as unknown as string;
        if (key !== characterId) continue;
        const ident = entity.get(CharacterIdentity);
        if (ident.userId !== userId) return undefined;
        return ident.areaId;
      }
      return undefined;
    },

    dispose() {
      persistence.dispose();
    },
  };
}
