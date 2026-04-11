import type { Entity, EntityId } from "@rift/core";
import { defineModule } from "@rift/modular";
import {
  Alive,
  Appearance,
  AreaMember,
  CharacterMeta,
  ClientSession,
  Health,
  PlayerControlled,
  Position,
} from "../../components";
import type {
  AreaId,
  CharacterId,
  InventoryId,
  UserId,
} from "../../domain-ids";
import type { Infer } from "@rift/core";

export interface SpawnCharacterInit {
  clientId: string;
  characterId: CharacterId;
  userId: UserId;
  inventoryId: InventoryId;
  xp: number;
  areaId: AreaId;
  position: Infer<typeof Position>;
  appearance: Infer<typeof Appearance>;
  health: Infer<typeof Health>;
}

export interface CharacterApi {
  spawnCharacter(init: SpawnCharacterInit): Entity;
  despawnCharacter(characterId: CharacterId): void;
  getEntity(characterId: CharacterId): Entity | undefined;
}

export const CharacterModule = defineModule({
  server: (ctx): { api: CharacterApi } => {
    const byCharacter = new Map<CharacterId, EntityId>();

    const spawnCharacter: CharacterApi["spawnCharacter"] = (init) => {
      if (byCharacter.has(init.characterId)) {
        throw new Error(`Character "${init.characterId}" is already spawned`);
      }
      const entity = ctx.rift.spawn();
      entity.set(CharacterMeta, {
        characterId: init.characterId,
        userId: init.userId,
        inventoryId: init.inventoryId,
        xp: init.xp,
      });
      entity.set(ClientSession, { clientId: init.clientId });
      entity.set(AreaMember, { areaId: init.areaId });
      entity.set(Position, init.position);
      entity.set(Appearance, init.appearance);
      entity.set(Health, init.health);
      entity.set(PlayerControlled);
      entity.set(Alive);
      byCharacter.set(init.characterId, entity.id);
      return entity;
    };

    const getEntity: CharacterApi["getEntity"] = (characterId) => {
      const id = byCharacter.get(characterId);
      return id === undefined ? undefined : ctx.rift.entity(id);
    };

    const despawnCharacter: CharacterApi["despawnCharacter"] = (
      characterId,
    ) => {
      const id = byCharacter.get(characterId);
      if (id === undefined) return;
      byCharacter.delete(characterId);
      const entity = ctx.rift.entity(id);
      if (entity) ctx.rift.destroy(entity);
    };

    return {
      api: { spawnCharacter, despawnCharacter, getEntity },
    };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});
