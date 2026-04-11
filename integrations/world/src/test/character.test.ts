import { RiftServer } from "@rift/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@mp/auth";
import { Vector } from "@mp/math";
import {
  Alive,
  Appearance,
  AreaMember,
  CharacterMeta,
  ClientSession,
  Health,
  PlayerControlled,
  Position,
} from "../components";
import type { AreaId, CharacterId, InventoryId } from "../domain-ids";
import { CharacterModule } from "../modules/character/module";
import type {
  CharacterApi,
  SpawnCharacterInit,
} from "../modules/character/module";
import { createWorld } from "../world";

function makeApi(): { api: CharacterApi; rift: RiftServer } {
  const rift = new RiftServer(createWorld());
  const result = CharacterModule.server!({
    rift,
    wss: { on: () => {} },
    values: {},
    addClient: () => {},
    removeClient: () => {},
    using: () => ({}) as never,
    onTick: () => {},
  });
  return { api: (result as { api: CharacterApi }).api, rift };
}

function makeInit(
  overrides: Partial<SpawnCharacterInit> = {},
): SpawnCharacterInit {
  return {
    clientId: "c1",
    characterId: "char-1" as CharacterId,
    userId: "user-1" as UserId,
    inventoryId: "inv-1" as InventoryId,
    xp: 0,
    areaId: "area-1" as AreaId,
    position: new Vector(1, 2),
    appearance: {
      name: "Hero",
      modelId: "model" as never,
      color: 0xffffff,
      opacity: 1,
    },
    health: { current: 100, max: 100 },
    ...overrides,
  };
}

describe("CharacterModule", () => {
  let api: CharacterApi;
  let rift: RiftServer;

  beforeEach(() => {
    ({ api, rift } = makeApi());
  });

  it("spawnCharacter attaches expected components", () => {
    const entity = api.spawnCharacter(makeInit());
    expect(entity.has(CharacterMeta)).toBe(true);
    expect(entity.has(ClientSession)).toBe(true);
    expect(entity.has(AreaMember)).toBe(true);
    expect(entity.has(Position)).toBe(true);
    expect(entity.has(Appearance)).toBe(true);
    expect(entity.has(Health)).toBe(true);
    expect(entity.has(PlayerControlled)).toBe(true);
    expect(entity.has(Alive)).toBe(true);
    expect(entity.get(CharacterMeta).characterId).toBe("char-1");
    expect(entity.get(Position).x).toBe(1);
  });

  it("getEntity returns the spawned entity", () => {
    const entity = api.spawnCharacter(makeInit());
    expect(api.getEntity("char-1" as CharacterId)?.id).toBe(entity.id);
  });

  it("despawnCharacter destroys the entity and clears registry", () => {
    const entity = api.spawnCharacter(makeInit());
    api.despawnCharacter("char-1" as CharacterId);
    expect(rift.entity(entity.id)).toBeUndefined();
    expect(api.getEntity("char-1" as CharacterId)).toBeUndefined();
  });

  it("rejects double spawn for same characterId", () => {
    api.spawnCharacter(makeInit());
    expect(() => api.spawnCharacter(makeInit())).toThrow(/already spawned/);
  });
});
