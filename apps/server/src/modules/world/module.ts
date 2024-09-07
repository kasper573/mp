import type { TimeSpan } from "@mp/time";
import {
  findPath,
  moveAlongPath,
  type AreaId,
  type AreaResource,
} from "@mp/state";
import { Vector } from "@mp/math";
import type { Logger } from "@mp/logger";
import type { ConnectReason } from "@mp/network/server";
import { type DisconnectReason } from "@mp/network/server";
import { t } from "../factory";
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
}: WorldModuleDependencies) {
  return t.module({
    tick: t.procedure
      .type("server-only")
      .input<TimeSpan>()
      .create(({ input: delta }) => {
        for (const char of state.characters.values()) {
          if (char.path) {
            moveAlongPath(char.coords, char.path, char.speed, delta);
          }

          const area = areas.get(char.areaId);
          if (area) {
            for (const hit of area.hitTestObjects([char], (c) => c.coords)) {
              const targetArea = areas.get(
                hit.object.properties.get("goto")?.value as AreaId,
              );
              if (targetArea) {
                char.areaId = targetArea.id;
                char.coords = targetArea.start.copy();
                char.path = [];
              }
            }
          }
        }
      }),

    move: t.procedure
      .input<Vector>()
      .create(({ input: { x, y }, context: { source } }) => {
        const { characterId } = source.unwrap("client");
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

        const idx = char.path?.findIndex((c) => c.x === x && c.y === y);
        if (idx !== undefined && idx !== -1) {
          char.path = char.path?.slice(0, idx + 1);
        } else {
          const newPath = findPath(char.coords, new Vector(x, y), area.dGraph);
          if (newPath) {
            char.path = newPath;
          }
        }
      }),

    join: t.procedure
      .type("server-only")
      .input<ConnectReason>()
      .create(({ input: connectReason, context: { source } }) => {
        const { clientId, characterId } = source.unwrap("client");
        if (connectReason === "recovered") {
          logger.info("Client reconnected", clientId);
        } else {
          logger.info("Client joined", clientId);
        }

        let player = state.characters.get(characterId);
        if (!player) {
          logger.info("Character created", characterId);

          const area = areas.get(defaultAreaId);
          if (!area) {
            logger.error("Default area not found", defaultAreaId);
            return;
          }

          player = {
            areaId: area.id,
            coords: new Vector(0, 0),
            id: characterId,
            path: [],
            speed: 3,
          };
          player.coords = area.start.copy();
          state.characters.set(player.id, player);
        } else {
          logger.info("Character reclaimed", characterId);
        }
      }),

    leave: t.procedure
      .type("server-only")
      .input<DisconnectReason>()
      .create(async ({ input: reason, context: { source } }) => {
        const { clientId, characterId } = source.unwrap("client");
        logger.info("Client disconnected", { clientId, characterId, reason });
      }),
  });
}
