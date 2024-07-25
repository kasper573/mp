import type { Client } from "colyseus";
import { Room } from "colyseus";
import { messageReceiver } from "@mp/events";
import { Area, Character } from "./state";
import { type ServerMessages } from "./messages";

export class TestRoom extends Room<Area> {
  fixedTimeStep = 1000 / 60;

  bus = messageReceiver<ServerMessages>()(this);

  override onCreate() {
    this.setState(new Area());

    console.log("restarted server again");

    this.bus.onMessage("move", (client, { x, y }) => {
      const char = this.state.characters.get(client.sessionId);
      if (char) {
        char.coords.x = x;
        char.coords.y = y;
      }
    });
  }

  override onJoin(client: Client) {
    console.log(client.sessionId, "joined!");

    const player = new Character(client.sessionId);
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
