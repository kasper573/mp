import path from "path";
import type { Client } from "colyseus";
import { Room } from "colyseus";
import { messageReceiver } from "@mp/events";
import { env } from "../../env";
import { type AreaMessages } from "./messages";
import { Area, Character } from "./schema";
import { findPath } from "./findPath";
import { moveAlongPath } from "./moveAlongPath";
import { loadPathGraph } from "./loadPathGraph";
import { loadTiledMap } from "./loadTiledMap";
import { getStartingPoint } from "./getStartingPoint";

export class AreaRoom extends Room<Area> {
  bus = messageReceiver<AreaMessages>()(this);
  tiledMapPromise = loadTiledMap(
    path.resolve(__dirname, "../../../../client/public/areas/island.tmx"),
  );

  override onCreate() {
    this.setState(new Area());

    this.bus.onMessage("move", async (client, [x, y]) => {
      const char = this.state.characters.get(client.sessionId);
      if (char) {
        const pathGraph = await loadPathGraph(await this.tiledMapPromise);
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

  override async onJoin(client: Client) {
    console.log(client.sessionId, "joined!");

    const player = new Character(client.sessionId);
    player.coords =
      getStartingPoint(await this.tiledMapPromise) ?? player.coords;
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
