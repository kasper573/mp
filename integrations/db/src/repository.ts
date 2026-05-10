import type { UserId } from "@mp/auth";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { ActorModelId, AreaId } from "@mp/world";
import { createDrizzleClient } from "./utils/client";
import { mayAccessCharacter } from "./procedures/may-access-character";
import { selectCharacterByUser } from "./procedures/select-character-by-user";
import { selectCharacterList } from "./procedures/select-character-list";
import { selectCharacterRow } from "./procedures/select-character-row";
import { selectOrCreateCharacterIdForUser } from "./procedures/select-or-create-character-id";
import { updateCharacter } from "./procedures/update-character";
import { updateCharactersArea } from "./procedures/update-characters-area";
import { upsertCharacter } from "./procedures/upsert-character";

export function createDbRepository(connectionString: string) {
  const drizzle = createDrizzleClient(connectionString);
  const selectOrCreate = selectOrCreateCharacterIdForUser.build(drizzle);

  return {
    mayAccessCharacter: mayAccessCharacter.build(drizzle),
    selectCharacterByUser: selectCharacterByUser.build(drizzle),
    selectCharacterList: selectCharacterList.build(drizzle),
    selectCharacterRow: selectCharacterRow.build(drizzle),
    selectOrCreateCharacterIdForUser: (input: {
      user: { id: UserId; name: string };
      spawnPoint: { areaId: AreaId; coords: Vector<Tile> };
      defaultModelId?: ActorModelId;
    }) =>
      selectOrCreate({
        user: input.user,
        spawnPoint: input.spawnPoint,
        defaultModelId: input.defaultModelId ?? ("adventurer" as ActorModelId),
      }),
    updateCharacter: updateCharacter.build(drizzle),
    updateCharactersArea: updateCharactersArea.build(drizzle),
    upsertCharacter: upsertCharacter.build(drizzle),

    subscribeToErrors(handler: (error: Error) => unknown) {
      drizzle.$client.on("error", handler);
      return () => drizzle.$client.off("error", handler);
    },

    dispose() {
      return drizzle.$client.end();
    },
  };
}

export type DbRepository = ReturnType<typeof createDbRepository>;
