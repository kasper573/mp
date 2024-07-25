import type { Client } from "colyseus";
import { Room } from "colyseus";
import { Area, Character, Coordinate } from "./state";

export class TestRoom extends Room<Area> {
  fixedTimeStep = 1000 / 60;

  override onCreate() {
    this.setState(new Area());

    this.onMessage(0, (client, { x, y }) => {
      const char = this.state.characters.get(client.sessionId);
      if (char) {
        char.coords = new Coordinate(x, y);
      }
    });
  }

  override onJoin(client: Client) {
    console.log(client.sessionId, "joined!");

    const player = new Character(client.sessionId);
    this.state.characters.set(player.id, player);
  }

  override onLeave(client: Client) {
    console.log(client.sessionId, "left!");
    this.state.characters.delete(client.sessionId);
  }

  override onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
