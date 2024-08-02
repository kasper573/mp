import type { WorldState } from "@mp/server";
import type { Room } from "colyseus.js";
import { Engine } from "@mp/excalibur";
import { type AreaId } from "@mp/state";
import type { AreaLoader } from "./AreaLoader";
import { AreaScene } from "./AreaScene";

export function createGame(
  world: Room<WorldState>,
  areaLoader: AreaLoader,
  debug: (text: string) => void,
): Game {
  const game = new Engine({});
  const emitter = world.onStateChange(() => changeArea(me(world)?.areaId));
  const changeArea = createAreaChanger(game, (id) =>
    areaLoader.require(id).then((area) => new AreaScene(world, area, debug)),
  );

  return {
    get canvas() {
      return game.canvas;
    },
    dispose() {
      emitter.clear();
      game.dispose();
    },
    start: () => game.start(),
  };
}

function me(world: Room<WorldState>) {
  return world.state.characters.get(world.sessionId);
}

function createAreaChanger(
  game: Engine,
  loadScene: (id: AreaId) => Promise<AreaScene>,
) {
  let currentAreaId: AreaId | undefined;
  return async function changeArea(areaId?: AreaId) {
    if (currentAreaId === areaId) {
      return;
    }

    currentAreaId = areaId;
    if (areaId === undefined) {
      return;
    }

    const nextScene = await loadScene(areaId);

    let sceneToRemove: AreaScene | undefined;
    if (game.currentScene instanceof AreaScene) {
      nextScene.inheritProperties(game.currentScene as AreaScene);
      sceneToRemove = game.currentScene;
    }

    game.addScene(nextScene.area.id, nextScene);
    await game.goToScene(nextScene.area.id);

    if (sceneToRemove) {
      game.removeScene(sceneToRemove);
    }
  };
}

export type Game = Pick<Engine, "dispose" | "start" | "canvas">;
