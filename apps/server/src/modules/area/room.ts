import path from "path";
import type { Client } from "colyseus";
import { Room } from "colyseus";
import { messageReceiver } from "@mp/events";
import type { TiledResource } from "@mp/excalibur";
import { env } from "../../env";
import { type AreaMessages } from "./messages";
import { Area, Character } from "./schema";
import { findPath } from "./findPath";
import { moveAlongPath } from "./moveAlongPath";
import { createPathGraph } from "./createPathGraph";
import { loadTiledMap } from "./loadTiledMap";
import { getStartingPoint } from "./getStartingPoint";

const islandTMX = path.resolve(
  __dirname,
  "../../../../client/public/areas/island.tmx",
);

export class AreaRoom extends Room<Area> {
  bus = messageReceiver<AreaMessages>()(this);
  tiledMap!: TiledResource;

  override async onCreate() {
    this.tiledMap = await loadTiledMap(islandTMX);

    const pathGraph = createPathGraph(this.tiledMap);

    this.setState(new Area());

    this.bus.onMessage("move", async (client, [x, y]) => {
      const char = this.state.characters.get(client.sessionId);
      if (char) {
        const path = findPath(char.coords, { x, y }, pathGraph);
        if (path) {
          char.path = path;
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
    player.coords = getStartingPoint(this.tiledMap) ?? player.coords;
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
