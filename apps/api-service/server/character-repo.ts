import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { UserId, UserIdentity } from "@mp/auth";
import { createShortId } from "@mp/std";
import { err, ok, type Result } from "@mp/std";
import { RiftServer, RiftWorld } from "@rift/core";
import { PersistenceId } from "@rift/persistence";
import { RiftPersistence } from "@rift/persistence/server";
import {
  buildCharacterMetadataPersistenceSchema,
  CharacterIdentity,
  defaultAreaId,
  type AreaId,
  type CharacterId,
} from "@mp/world";

export interface CharacterRecord {
  id: CharacterId;
  name: string;
  areaId: AreaId;
}

export interface NameAlreadyTakenError {
  type: "nameAlreadyTaken";
  name: string;
}

export interface CharacterRepository {
  findByUser(userId: UserId): CharacterRecord | undefined;
  findOrCreateForUser(user: UserIdentity): CharacterId;
  listByIds(ids: readonly CharacterId[]): CharacterRecord[];
  updateName(
    id: CharacterId,
    newName: string,
  ): Result<void, NameAlreadyTakenError>;
  dispose(): void;
}

export function createCharacterRepository(args: {
  instanceId: string;
  dbPath: string;
}): CharacterRepository {
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
      saveInterval: 1000,
    }),
  );
  persistence.start();

  function refresh(): void {
    persistence.poll();
  }

  return {
    findByUser(userId) {
      refresh();
      for (const entity of rift.query(PersistenceId, CharacterIdentity).value) {
        const ident = entity.get(CharacterIdentity);
        if (ident.userId === userId) {
          return {
            id: entity.get(PersistenceId) as unknown as CharacterId,
            name: ident.name,
            areaId: ident.areaId,
          };
        }
      }
      return undefined;
    },

    findOrCreateForUser(user) {
      const existing = this.findByUser(user.id);
      if (existing) {
        return existing.id;
      }
      const id = createShortId<CharacterId>();
      const entity = rift.spawn();
      entity.set(PersistenceId, id as never);
      entity.set(CharacterIdentity, {
        name: user.name,
        userId: user.id,
        areaId: defaultAreaId,
      });
      persistence.persist();
      return id;
    },

    listByIds(ids) {
      refresh();
      const set = new Set<string>(ids);
      const out: CharacterRecord[] = [];
      for (const entity of rift.query(PersistenceId, CharacterIdentity).value) {
        const key = entity.get(PersistenceId) as unknown as string;
        if (!set.has(key)) continue;
        const ident = entity.get(CharacterIdentity);
        out.push({
          id: key as CharacterId,
          name: ident.name,
          areaId: ident.areaId,
        });
      }
      return out;
    },

    updateName(id, newName) {
      refresh();
      let target: ReturnType<typeof rift.spawn> | undefined;
      for (const entity of rift.query(PersistenceId, CharacterIdentity).value) {
        const key = entity.get(PersistenceId) as unknown as string;
        const ident = entity.get(CharacterIdentity);
        if (ident.name === newName && key !== id) {
          return err({ type: "nameAlreadyTaken" as const, name: newName });
        }
        if (key === id) {
          target = entity;
        }
      }
      if (!target) {
        throw new Error(`No character found with id ${id}`);
      }
      const ident = target.get(CharacterIdentity);
      target.set(CharacterIdentity, { ...ident, name: newName });
      persistence.persist();
      return ok(undefined);
    },

    dispose() {
      persistence.dispose();
    },
  };
}
