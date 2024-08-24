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

  let unsubFromState: () => void;

  return {
    async init({ canvas, resizeTo }: GameInitOptions) {
      Engine.replace(canvas);
      unsubFromState = api.state.subscribe(() => changeArea(me()?.areaId));
      await game.init({ antialias: true, resizeTo, canvas });
    },
    dispose() {
      unsubFromState();
      game.destroy(undefined, { children: true });
    },
  };
}

function me() {
  return api.state.value.characters.get(api.clientId as CharacterId);
}

// TODO refactor
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
    const [currentScene] = game.stage.children;
    if (currentScene instanceof AreaScene) {
      game.stage.removeChild(currentScene);
    }

    if (areaId === undefined) {
      return;
    }

    const nextScene = await loadScene(areaId);

    if (currentScene instanceof AreaScene) {
      nextScene.inheritProperties(currentScene as AreaScene);
    }

    game.stage.addChild(nextScene);
  };
}

export interface GameInitOptions {
  canvas: HTMLCanvasElement;
  resizeTo: HTMLElement | Window;
}

export interface Game {
  init(options: GameInitOptions): Promise<void>;
  dispose(): void;
}
