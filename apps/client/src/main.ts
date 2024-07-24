import type { Room } from "colyseus.js";
import { Client } from "colyseus.js";
import type { TestRoomState } from "@mp/server";

import { env } from "./env";
import { createApp } from "./map";

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

  const { renderer, stats } = createApp(room);
  document.body.append(renderer.domElement, stats.dom);
}

document.addEventListener("DOMContentLoaded", init);
