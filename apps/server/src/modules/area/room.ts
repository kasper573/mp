import type { Client } from "colyseus";
import { Room } from "colyseus";
import { messageReceiver } from "@mp/events";
import {
  dGraphFromTiled,
  findPath,
  getStartingPoint,
  moveAlongPath,
} from "@mp/state";
import { env } from "../../env";
import { Area, Character, Coordinate } from "./schema";
import { type AreaMessages } from "./messages";
import type { AreaResource } from "./loadAreas";

export class AreaRoom extends Room<Area> {
  bus = messageReceiver<AreaMessages>()(this);
  area!: AreaResource;

  override async onCreate(area: AreaResource) {
    this.area = area;
    const dGraph = dGraphFromTiled(this.area.tiled);
    this.setState(new Area(this.area.tmxFile.url));

    this.bus.onMessage("move", async (client, [x, y]) => {
      const char = this.state.characters.get(client.sessionId);
      if (char) {
        const idx = char.path.findIndex((c) => c.x === x && c.y === y);
        if (idx !== -1) {
          char.path = Coordinate.many(char.path.slice(0, idx + 1));
        } else {
          const newPath = findPath(char.coords, { x, y }, dGraph);
          if (newPath) {
            char.path = Coordinate.many(newPath);
          }
        }
      }
    });

    this.setSimulationInterval(this.onTick, env.tickInterval);
  }

  onTick = (deltaTimeMs: number) => {
    const deltaTime = deltaTimeMs / 1000;
    for (const char of this.state.characters.values()) {
      moveAlongPath(char.coords, char.path, char.speed * deltaTime);
    }
  };

  override onJoin(client: Client) {
    console.log(client.sessionId, "joined!");

    const player = new Character(client.sessionId);
    const start = getStartingPoint(this.area.tiled);
    if (start) {
      player.coords = new Coordinate(start.x, start.y);
    }
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
