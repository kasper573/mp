import type { CharacterId } from "@mp/server";
import { type AreaId } from "@mp/state";
import { Application } from "@mp/pixi";
import { api } from "../api";
import type { AreaLoader } from "./AreaLoader";
import { AreaScene } from "./AreaScene";
import { Engine } from "./Engine";

export function createGame(
  areaLoader: AreaLoader,
  debug: (text: string) => void,
): Game {
  const game = new Application();

  const changeArea = createAreaChanger(game, (id) =>
    areaLoader.require(id).then((area) => new AreaScene(area, debug)),
  );
  const unsubFromState = api.state.subscribe(() => changeArea(me()?.areaId));

  return {
    async init({ canvas }: GameInitOptions) {
      Engine.replace(canvas);
      await game.init({
        antialias: true,
        background: 0x005500,
        resizeTo: window,
        canvas,
      });
    },
    dispose() {
      unsubFromState();
      game.destroy();
    },
  };
}

function me() {
  return api.state.value.characters.get(api.clientId as CharacterId);
}

function createAreaChanger(
  game: Application,
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
    const [currentScene] = game.stage.children;

    if (currentScene instanceof AreaScene) {
      nextScene.inheritProperties(currentScene as AreaScene);
      game.stage.removeChild(currentScene);
    }

    game.stage.addChild(nextScene);
  };
}

export interface GameInitOptions {
  canvas: HTMLCanvasElement;
}

export interface Game {
  init(options: GameInitOptions): Promise<void>;
  dispose(): void;
}
