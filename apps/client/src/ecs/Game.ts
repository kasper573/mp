import type { Area } from "@mp/server";
import type { Room } from "colyseus.js";
import { Engine } from "@mp/excalibur";
import { AreaScene } from "./AreaScene";

export function createGame(
  room: Room<Area>,
  renderDebugText: (text: string) => void,
) {
  const game = new Engine({
    scenes: { area: new AreaScene(room, renderDebugText) },
  });

  game.goToScene("area");

  return game;
}
