import { Client } from "colyseus.js";
import type { Area } from "@mp/server";
import { DisplayMode, Engine, Scene } from "excalibur";
import { env } from "./env";
import { AreaScene } from "./AreaScene";

const canvas = document.querySelector("canvas")!;

async function init() {
  const client = new Client(env.serverUrl);
  const room = await client.joinOrCreate<Area>("test_room", {});

  const game = new Engine({
    canvasElement: canvas,
    displayMode: DisplayMode.FillContainer,
    scenes: { area: new AreaScene(room), lobby: new Scene() },
  });

  room.onLeave(() => game.goToScene("lobby"));

  game.goToScene("area");
  game.start();
}

document.addEventListener("DOMContentLoaded", init);
