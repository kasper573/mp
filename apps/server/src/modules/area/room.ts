import path from "path";
import type { Client } from "colyseus";
import { Room } from "colyseus";
import { messageReceiver } from "@mp/events";
import { snapTileVector, type TiledResource } from "@mp/excalibur";
import {
  dGraphFromTiled,
  findPath,
  getStartingPoint,
  moveAlongPath,
} from "@mp/state";
import { env } from "../../env";
import { loadTiled } from "./loadTiled";
import { Area, Character, Coordinate } from "./schema";
import { type AreaMessages } from "./messages";

const islandTMX = path.resolve(
  __dirname,
  "../../../../client/public/areas/island.tmx",
);

export class AreaRoom extends Room<Area> {
  bus = messageReceiver<AreaMessages>()(this);
  tiled!: TiledResource;

  override async onCreate() {
    this.tiled = await loadTiled(islandTMX);

    const dGraph = dGraphFromTiled(this.tiled);

    this.setState(new Area());

    this.bus.onMessage("move", async (client, [x, y]) => {
      const char = this.state.characters.get(client.sessionId);
      if (char) {
        const to = snapTileVector({ x, y });
        const idx = char.path.findIndex((c) => c.x === to.x && c.y === to.y);
        if (idx !== -1) {
          char.path = Coordinate.many(char.path.slice(0, idx + 1));
        } else {
          char.path = Coordinate.many(findPath(char.coords, to, dGraph));
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
    const start = getStartingPoint(this.tiled);
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
