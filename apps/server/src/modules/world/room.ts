import type { Client } from "colyseus";
import { Room } from "colyseus";
import { messageReceiver } from "@mp/events";
import type { AreaId, AreaResource } from "@mp/state";
import { findPath, moveAlongPath } from "@mp/state";
import { ArraySchema } from "@colyseus/schema";
import { env } from "../../env";
import { Character, Coordinate } from "../area/schema";
import { type AreaMessages } from "../area/messages";
import { WorldState } from "./schema";

export class WorldRoom extends Room<WorldState> {
  bus = messageReceiver<AreaMessages>()(this);

  constructor(
    private areas: Map<AreaId, AreaResource>,
    private defaultAreaId: AreaId,
  ) {
    super();
  }

  override async onCreate() {
    this.setState(new WorldState());

    this.bus.onMessage("move", this.moveClient);

    this.setSimulationInterval(this.onTick, env.tickInterval);
  }

  onTick = (deltaTimeMs: number) => {
    const deltaTime = deltaTimeMs / 1000;
    for (const char of this.state.characters.values()) {
      moveAlongPath(char.coords, char.path, char.speed * deltaTime);

      const area = this.areas.get(char.areaId);
      if (area) {
        for (const hit of area.hitTestObjects([char], (c) => c.coords)) {
          const targetArea = this.areas.get(
            hit.object.properties.get("goto") as AreaId,
          );
          if (targetArea) {
            char.areaId = targetArea.id;
            char.coords = Coordinate.one(targetArea.start);
            char.path = new ArraySchema();
          }
        }
      }
    }
  };

  moveClient = (client: Client, [x, y]: [number, number]) => {
    const char = this.state.characters.get(client.sessionId);
    if (!char) {
      console.error("No character available for session id", client.sessionId);
      return;
    }

    const area = this.areas.get(char.areaId);
    if (!area) {
      console.error("Area not found", char.areaId);
      return;
    }

    const idx = char.path.findIndex((c) => c.x === x && c.y === y);
    if (idx !== -1) {
      char.path = Coordinate.many(char.path.slice(0, idx + 1));
    } else {
      const newPath = findPath(char.coords, { x, y }, area.dGraph);
      if (newPath) {
        char.path = Coordinate.many(newPath);
      }
    }
  };

  override onJoin(client: Client) {
    console.log(client.sessionId, "joined!");
    const player = new Character(client.sessionId, this.defaultAreaId);
    const area = this.areas.get(this.defaultAreaId);
    if (!area) {
      console.error("Default area not found", this.defaultAreaId);
      return;
    }

    player.coords = Coordinate.one(area.start);
    player.connected = true;
    this.state.characters.set(player.id, player);
  }

  override async onLeave(client: Client, consented: boolean) {
    this.state.characters.get(client.sessionId)!.connected = false;
    try {
      if (consented) {
        throw new Error("consented leave");
      }
      console.log("Allowing reconnection...", client.sessionId);
      await this.allowReconnection(client, 2);
      this.state.characters.get(client.sessionId)!.connected = false;
    } catch {
      console.log(client.sessionId, "left!");
      this.state.characters.delete(client.sessionId);
    }
  }

  override onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
