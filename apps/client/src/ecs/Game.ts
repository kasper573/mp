import type { CharacterId } from "@mp/server";
import { Engine } from "@mp/excalibur";
import { type AreaId } from "@mp/state";
import { api } from "../api";
import type { AreaLoader } from "./AreaLoader";
import { AreaScene } from "./AreaScene";

export function createGame(
  areaLoader: AreaLoader,
  debug: (text: string) => void,
): Game {
  const game = new Engine({});

  const changeArea = createAreaChanger(game, (id) =>
    areaLoader.require(id).then((area) => new AreaScene(area, debug)),
  );
  const unsubFromState = api.state.subscribe(() => changeArea(me()?.areaId));

  return {
    get canvas() {
      return game.canvas;
    },
    dispose() {
      unsubFromState();
      game.dispose();
    },
    start: () => game.start(),
  };
}

function me() {
  return api.state.value.characters.get(
    api.state.value.clientId as CharacterId,
  );
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
