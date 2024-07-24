import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { Client } from "colyseus.js";
import type { TestRoomState } from "@mp/server";

import { env } from "./env";
import { createScene } from "./Scene";

async function init() {
  const debugText = document.querySelector<HTMLSpanElement>("span#debug")!;

  const client = new Client(env.serverUrl);
  let room: Room<TestRoomState>;
  try {
    room = await client.joinOrCreate<TestRoomState>("test_room", {});
  } catch (e) {
    debugText.innerText = `Error: ${e}`;
    return;
  }

  const scene = createScene(room);
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    fps: {
      target: 60,
      forceSetTimeOut: true,
      smoothStep: false,
    },
    width: 800,
    height: 600,
    backgroundColor: "#b6d53c",
    parent: "mp",
    physics: { default: "arcade" },
    pixelArt: true,
    scene: [scene],
  });

  phaser.events.on(Phaser.Core.Events.PRE_RENDER, () => {
    debugText.innerText = `Frame rate: ${phaser.loop.actualFps.toFixed(2)}`;
  });
}

document.addEventListener("DOMContentLoaded", init);
