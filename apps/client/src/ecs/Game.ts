import { type AreaId } from "@mp/state";
import { Application } from "@mp/pixi";
import { api, getMyFakeCharacterId } from "../api";
import type { AreaLoader } from "./AreaLoader";
import { AreaScene } from "./AreaScene";
import { Engine } from "./Engine";

export function createGame(
  areaLoader: AreaLoader,
  debug: (text: string) => void,
): Game {
  const canvas = document.createElement("canvas");
  const game = new Application();

  const changeArea = createAreaChanger(game, (id) =>
    areaLoader.require(id).then((area) => new AreaScene(area, debug)),
  );

  let unsubFromState: () => void;

  return {
    canvas,
    async init({ container, resizeTo }: GameInitOptions) {
      container.appendChild(canvas);
      unsubFromState = api.state.subscribe(() => changeArea(me()?.areaId));
      await game.init({ antialias: true, resizeTo, canvas });
      game.stage.interactive = true;
      Engine.replace(game.stage);
    },
    dispose() {
      unsubFromState();
      game.destroy(undefined, { children: true });
      canvas.remove();
    },
  };
}

function me() {
  return api.state.value.characters.get(getMyFakeCharacterId());
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

    game.stage.addChild(await loadScene(areaId));
  };
}

export interface GameInitOptions {
  container: HTMLElement;
  resizeTo: HTMLElement | Window;
}

export interface Game {
  canvas: HTMLCanvasElement;
  init(options: GameInitOptions): Promise<void>;
  dispose(): void;
}
