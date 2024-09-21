import { type AreaId } from "@mp/data";
import { computed } from "@mp/state";
import { Application, Engine } from "@mp/pixi";
import { api, myCharacterId } from "../api";
import type { AreaLoader } from "./AreaLoader";
import { AreaScene } from "./AreaScene";

export function createGame({
  areaLoader,
  debug,
  container,
  resizeTo,
}: GameOptions): Game {
  const canvas = document.createElement("canvas");
  Engine.replace(canvas);

  const app = new Application();

  const changeArea = createAreaChanger(app, (id) =>
    areaLoader.require(id).then((area) => new AreaScene(area, debug)),
  );

  container.appendChild(canvas);

  const stopChangingAreas = myAreaId.subscribe((id) => void changeArea(id));

  const initPromise = app.init({
    antialias: true,
    roundPixels: true,
    resizeTo,
    canvas,
  });

  void initPromise.then(() => {
    app.stage.interactive = true;
  });

  return {
    canvas,
    async dispose() {
      Engine.instance.stop();
      stopChangingAreas();
      canvas.remove();
      await initPromise.then(() => {
        app.destroy(undefined, { children: true });
      });
    },
  };
}

const myAreaId = computed(
  () => api.state.value.characters.get(myCharacterId.value)?.areaId,
);

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
