import { type AreaId } from "@mp/state";
import { Application, Engine } from "@mp/pixi";
import { api, getMyFakeCharacterId } from "../api";
import type { AreaLoader } from "./AreaLoader";
import { AreaScene } from "./AreaScene";

export function createGame({
  areaLoader,
  debug,
  container,
  resizeTo,
}: GameOptions): Game {
  const canvas = document.createElement("canvas");
  const app = new Application();

  const changeArea = createAreaChanger(app, (id) =>
    areaLoader.require(id).then((area) => new AreaScene(area, debug)),
  );

  container.appendChild(canvas);

  const unsubFromState = api.state.subscribe(
    () => void changeArea(me()?.areaId),
  );

  const initPromise = app.init({
    antialias: true,
    roundPixels: true,
    resizeTo,
    canvas,
  });

  void initPromise.then(() => {
    app.stage.interactive = true;
    Engine.replace(canvas);
  });

  return {
    canvas,
    async dispose() {
      Engine.instance.stop();
      unsubFromState();
      canvas.remove();
      await initPromise.then(() => {
        app.destroy(undefined, { children: true });
      });
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

export interface GameOptions {
  areaLoader: AreaLoader;
  debug: (text: string) => void;
  container: HTMLElement;
  resizeTo: HTMLElement | Window;
}

export interface Game {
  canvas: HTMLCanvasElement;
  dispose(): Promise<void>;
}
