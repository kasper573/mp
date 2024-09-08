import { type AreaId } from "@mp/state";
import { Application, Engine } from "@mp/pixi";
import { api, getMyFakeCharacterId } from "../api";
import type { AreaLoader } from "./AreaLoader";
import { AreaScene } from "./AreaScene";

export function createGame(
  areaLoader: AreaLoader,
  debug: (text: string) => void,
): Game {
  const canvas = document.createElement("canvas");
  const app = new Application();

  const changeArea = createAreaChanger(app, (id) =>
    areaLoader.require(id).then((area) => new AreaScene(area, debug)),
  );

  let unsubFromState: () => void = () => {};
  let initPromise: Promise<unknown>;

  return {
    canvas,
    async init({ container, resizeTo }: GameInitOptions) {
      container.appendChild(canvas);
      unsubFromState = api.state.subscribe(() => void changeArea(me()?.areaId));
      initPromise = app.init({
        antialias: true,
        roundPixels: true,
        resizeTo,
        canvas,
      });

      await initPromise;

      app.stage.interactive = true;
      Engine.replace(app);
    },
    async dispose() {
      unsubFromState();
      canvas.remove();
      await initPromise;
      app.destroy(undefined, { children: true });
    },
  };
}

function me() {
  return api.state.value.characters.get(getMyFakeCharacterId());
}

// TODO refactor
function createAreaChanger(
  app: Application,
  loadScene: (id: AreaId) => Promise<AreaScene>,
) {
  let currentAreaId: AreaId | undefined;
  return async function changeArea(areaId?: AreaId) {
    if (currentAreaId === areaId) {
      return;
    }

    currentAreaId = areaId;
    const [currentScene] = app.stage.children;
    if (currentScene instanceof AreaScene) {
      app.stage.removeChild(currentScene);
    }

    if (areaId === undefined) {
      return;
    }

    app.stage.addChild(await loadScene(areaId));
  };
}

export interface GameInitOptions {
  container: HTMLElement;
  resizeTo: HTMLElement | Window;
}

export interface Game {
  canvas: HTMLCanvasElement;
  init(options: GameInitOptions): Promise<void>;
  dispose(): Promise<void>;
}
