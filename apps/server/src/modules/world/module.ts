import type { TimeSpan } from "@mp/state";
import {
  findPath,
  moveAlongPath,
  type AreaId,
  type AreaResource,
} from "@mp/state";
import type { VectorLike } from "@mp/excalibur";
import type { Logger } from "@mp/logger";
import type { DisconnectReason } from "@mp/network/server";
import { t } from "../factory";
import type { ConnectionModule } from "../connection";
import type { ServerContext } from "../../context";
import type { Character } from "../character/schema";
import type { WorldState } from "./schema";

export interface WorldModuleDependencies {
  state: WorldState;
  connection: ConnectionModule;
  areas: Map<AreaId, AreaResource>;
  defaultAreaId: AreaId;
  logger: Logger;
  allowReconnection: (
    id: ServerContext["clientId"],
    timeoutSeconds: number,
  ) => Promise<boolean>;
}

export function createWorldModule({
  state,
  connection,
  areas,
  defaultAreaId,
  allowReconnection,
  logger,
}: WorldModuleDependencies) {
  const tick = t.event
    .type("server-only")
    .payload<TimeSpan>()
    .create(({ payload: delta }) => {
      for (const char of state.characters.values()) {
        moveAlongPath(char.coords, char.path, char.speed * delta.seconds);

        const area = areas.get(char.areaId);
        if (area) {
          for (const hit of area.hitTestObjects([char], (c) => c.coords)) {
            const targetArea = areas.get(
              hit.object.properties.get("goto") as AreaId,
            );
            if (targetArea) {
              char.areaId = targetArea.id;
              char.coords = targetArea.start;
              char.path = [];
            }
          }
        }
      }
    });

  const move = t.event
    .payload<VectorLike>()
    .create(({ payload: { x, y }, context: { clientId } }) => {
      const char = state.characters.get(clientId);
      if (!char) {
        console.error("No character available for session id", clientId);
        return;
      }

      const area = areas.get(char.areaId);
      if (!area) {
        console.error("Area not found", char.areaId);
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
    });

  const join = t.event
    .type("server-only")
    .create(({ context: { clientId } }) => {
      console.log(clientId, "joined!");

      const area = areas.get(defaultAreaId);
      if (!area) {
        console.error("Default area not found", defaultAreaId);
        return;
      }

      const player: Character = {
        connected: false,
        areaId: area.id,
        coords: { x: 0, y: 0 },
        id: clientId,
        path: [],
        speed: 3,
      };
      player.coords = area.start;
      player.connected = true;
      state.characters.set(player.id, player);
    });

  const leave = t.event
    .type("server-only")
    .payload<DisconnectReason>()
    .create(async ({ payload: reason, context: { clientId } }) => {
      logger.info("Client disconnected", { clientId, reason });
      state.characters.get(clientId)!.connected = false;

      if (reason !== "consented") {
        console.log("Allowing reconnection...", clientId);
        const didReconnect = await allowReconnection(clientId, 2);
        if (didReconnect) {
          console.log("Reconnected!", clientId);
          state.characters.get(clientId)!.connected = true;
          return;
        }
        console.log("Client never reconnected", clientId);
      }

      state.characters.delete(clientId);
      logger.info("Character removed", clientId);
    });

  // TODO when should these unsubscribe?
  connection.connect.subscribe(join.handler);
  connection.disconnect.subscribe(leave.handler);

  return t.module({ move, tick });
}
