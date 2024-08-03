import { TimeSpan } from "@mp/state";
import {
  findPath,
  moveAlongPath,
  type AreaId,
  type AreaResource,
} from "@mp/state";
import type { VectorLike } from "@mp/excalibur";
import type { Logger } from "@mp/logger";
import type { ConnectReason } from "@mp/network/server";
import { type DisconnectReason } from "@mp/network/server";
import { t } from "../factory";
import type { CharacterId } from "./schema";
import type { WorldState } from "./schema";

export interface WorldModuleDependencies {
  state: WorldState;
  areas: Map<AreaId, AreaResource>;
  defaultAreaId: AreaId;
  logger: Logger;
  characterKeepAliveTimeout?: TimeSpan;
}

export function createWorldModule({
  state,
  areas,
  defaultAreaId,
  logger,
  characterKeepAliveTimeout = TimeSpan.fromMilliseconds(5000),
}: WorldModuleDependencies) {
  const characterRemovalTimeouts = new Map<CharacterId, NodeJS.Timeout>();

  function enqueueCharacterRemoval(id: CharacterId) {
    characterRemovalTimeouts.set(
      id,
      setTimeout(
        () => removeCharacter(id),
        characterKeepAliveTimeout.totalMilliseconds,
      ),
    );
  }

  function cancelCharacterRemoval(id: CharacterId) {
    const timeout = characterRemovalTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      characterRemovalTimeouts.delete(id);
    }
  }

  function removeCharacter(id: CharacterId) {
    state.characters.delete(id);
    characterRemovalTimeouts.delete(id);
    logger.info("Character removed", id);
  }

  return t.module({
    tick: t.event
      .type("server-only")
      .payload<TimeSpan>()
      .create(({ payload: delta }) => {
        for (const char of state.characters.values()) {
          moveAlongPath(char.coords, char.path, char.speed, delta);

          const area = areas.get(char.areaId);
          if (area) {
            for (const hit of area.hitTestObjects([char], (c) => c.coords)) {
              const targetArea = areas.get(
                hit.object.properties.get("goto") as AreaId,
              );
              if (targetArea) {
                char.areaId = targetArea.id;
                char.coords = targetArea.start.clone();
                char.path = [];
              }
            }
          }
        }
      }),

    move: t.event
      .payload<VectorLike>()
      .create(({ payload: { x, y }, context: { characterId } }) => {
        const char = state.characters.get(characterId);
        if (!char) {
          logger.error("Character not found", characterId);
          return;
        }

        const area = areas.get(char.areaId);
        if (!area) {
          logger.error("Area not found", char.areaId);
          return;
        }

        const idx = char.path.findIndex((c) => c.x === x && c.y === y);
        if (idx !== -1) {
          char.path = char.path.slice(0, idx + 1);
        } else {
          const newPath = findPath(char.coords, { x, y }, area.dGraph);
          if (newPath) {
            char.path = newPath;
          }
        }
      }),

    join: t.event
      .type("server-only")
      .payload<ConnectReason>()
      .create(
        ({ payload: connectReason, context: { clientId, characterId } }) => {
          if (connectReason === "recovered") {
            cancelCharacterRemoval(characterId);
            logger.info("Client reconnected", clientId);
          } else {
            logger.info("Client joined", clientId);
          }

          let player = state.characters.get(characterId);
          if (!player) {
            logger.info("Character claimed", characterId);

            const area = areas.get(defaultAreaId);
            if (!area) {
              logger.error("Default area not found", defaultAreaId);
              return;
            }

            player = {
              connected: false,
              areaId: area.id,
              coords: { x: 0, y: 0 },
              id: characterId,
              path: [],
              speed: 3,
            };
            player.coords = area.start.clone();
            state.characters.set(player.id, player);
          }

          player.connected = true;
        },
      ),

    leave: t.event
      .type("server-only")
      .payload<DisconnectReason>()
      .create(
        async ({ payload: reason, context: { clientId, characterId } }) => {
          logger.info("Client disconnected", { clientId, reason });
          state.characters.get(characterId)!.connected = false;

          if (reason !== "transport close") {
            logger.info("Allowing reconnection...", clientId);
            enqueueCharacterRemoval(characterId);
          } else {
            removeCharacter(characterId);
          }
        },
      ),
  });
}
