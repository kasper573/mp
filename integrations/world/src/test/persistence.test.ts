import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RiftServer } from "@rift/core";
import { RiftPersistence } from "@rift/persistence/server";
import { afterEach, describe, expect, it } from "vitest";
import type { UserId } from "@mp/auth";
import {
  Appearance,
  AreaMember,
  CharacterMeta,
  Health,
  PersistenceId,
  Position,
} from "../components";
import type { AreaId, CharacterId, InventoryId } from "../domain-ids";
import { CharacterModule } from "../modules/character/module";
import type { CharacterApi } from "../modules/character/module";
import {
  buildWorldPersistenceSchema,
  PersistenceModule,
} from "../modules/persistence/module";
import type { PersistenceApi } from "../modules/persistence/module";
import { createWorld } from "../world";

interface Harness {
  rift: RiftServer;
  persistence: RiftPersistence;
  character: CharacterApi;
  api: PersistenceApi;
  dispose(): void;
}

function makeHarness(dbPath = ":memory:"): Harness {
  const rift = new RiftServer(createWorld());
  const persistence = new RiftPersistence(
    rift,
    buildWorldPersistenceSchema({ instanceId: "test", dbPath }),
  );
  persistence.start();

  const baseCtx = {
    rift,
    wss: { on: () => {} },
    values: { worldPersistence: persistence },
    addClient: () => {},
    removeClient: () => {},
    onTick: () => {},
  };

  const charResult = CharacterModule.server!({
    ...baseCtx,
    using: () => ({}) as never,
  });
  const character = (charResult as { api: CharacterApi }).api;

  const persistResult = PersistenceModule.server!({
    ...baseCtx,
    using: ((m: unknown) =>
      m === CharacterModule ? character : ({} as never)) as never,
  });
  const api = (persistResult as { api: PersistenceApi }).api;

  return {
    rift,
    persistence,
    character,
    api,
    dispose: () => persistence.dispose(),
  };
}

function spawn(character: CharacterApi, id: string) {
  return character.spawnCharacter({
    clientId: "c1",
    characterId: id as CharacterId,
    userId: "u1" as UserId,
    inventoryId: "inv1" as InventoryId,
    xp: 0,
    areaId: "area-1" as AreaId,
    position: { x: 5, y: 6 },
    appearance: {
      name: "Hero",
      modelId: "model" as never,
      color: 0xffffff,
      opacity: 1,
    },
    health: { current: 80, max: 100 },
  });
}

const harnesses: Harness[] = [];
const tmpDirs: string[] = [];
function track(h: Harness): Harness {
  harnesses.push(h);
  return h;
}

function sharedDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "mp-world-persistence-"));
  tmpDirs.push(dir);
  return join(dir, "game.sqlite");
}

afterEach(() => {
  while (harnesses.length > 0) harnesses.pop()!.dispose();
  while (tmpDirs.length > 0) {
    const d = tmpDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("PersistenceModule", () => {
  it("activateCharacter attaches PersistenceId and acquires lease", () => {
    const h = track(makeHarness());
    const entity = spawn(h.character, "char-1");
    expect(h.api.activateCharacter(entity)).toBe(true);
    expect(entity.has(PersistenceId)).toBe(true);
    expect(entity.get(PersistenceId)).toBe("char-1");
  });

  it("persistNow writes character state that re-hydrates in a new session", () => {
    const dbPath = sharedDbPath();
    const h = track(makeHarness(dbPath));
    const entity = spawn(h.character, "char-1");
    h.api.activateCharacter(entity);
    entity.set(Position, { x: 42, y: 99 });
    entity.set(Health, { current: 33, max: 100 });
    h.api.persistNow();
    h.api.deactivateCharacter(entity);
    h.character.despawnCharacter("char-1" as CharacterId);
    h.api.persistNow();

    const h2 = track(makeHarness(dbPath));
    const fresh = spawn(h2.character, "char-1");
    fresh.set(Position, { x: 0, y: 0 });
    fresh.set(Health, { current: 1, max: 1 });
    h2.api.activateCharacter(fresh);
    expect(fresh.get(Position)).toEqual({ x: 42, y: 99 });
    expect(fresh.get(Health)).toEqual({ current: 33, max: 100 });
    expect(fresh.get(CharacterMeta).characterId).toBe("char-1");
    expect(fresh.get(AreaMember).areaId).toBe("area-1");
    expect(fresh.get(Appearance).name).toBe("Hero");
  });

  it("deactivateCharacter is a no-op if entity was never activated", () => {
    const h = track(makeHarness());
    const entity = spawn(h.character, "char-1");
    expect(() => h.api.deactivateCharacter(entity)).not.toThrow();
  });
});
