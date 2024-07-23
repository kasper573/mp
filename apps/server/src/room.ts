import type { Client } from "colyseus";
import { Room } from "colyseus";
import type { InputData } from "./state";
import { TestRoomState, Player } from "./state";

export class TestRoom extends Room<TestRoomState> {
  fixedTimeStep = 1000 / 60;

  onCreate() {
    this.setState(new TestRoomState());

    // set map dimensions
    this.state.mapWidth = 800;
    this.state.mapHeight = 600;

    this.onMessage(0, (client, input) => {
      // handle player input
      const player = this.state.players.get(client.sessionId);

      // enqueue input to user input buffer.
      player?.inputQueue.push(input);
    });

    let elapsedTime = 0;
    this.setSimulationInterval((deltaTime) => {
      elapsedTime += deltaTime;

      while (elapsedTime >= this.fixedTimeStep) {
        elapsedTime -= this.fixedTimeStep;
        this.fixedTick(this.fixedTimeStep);
      }
    });
  }

  fixedTick(timeStep: number) {
    const velocity = 2;

    this.state.players.forEach((player) => {
      let input: InputData | undefined;

      // dequeue player inputs
      while ((input = player.inputQueue.shift())) {
        if (input.left) {
          player.x -= velocity;
        } else if (input.right) {
          player.x += velocity;
        }

        if (input.up) {
          player.y -= velocity;
        } else if (input.down) {
          player.y += velocity;
        }

        player.tick = input.tick;
      }
    });
  }

  onJoin(client: Client) {
    console.log(client.sessionId, "joined!");

    const player = new Player();
    player.x = Math.random() * this.state.mapWidth;
    player.y = Math.random() * this.state.mapHeight;

    console.log("player", player.x, player.y);

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
