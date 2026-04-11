import { Engine } from "@mp/engine";
import { Application } from "@mp/graphics";
import type { Tile } from "@mp/std";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { defineModule } from "@rift/modular";
import type { AreaResource } from "../../area";
import { AreaScene, type SendFn } from "./area-scene";

export interface SetAreaInput {
  area: AreaResource;
  areaSpritesheets: TiledSpritesheetRecord;
  localCharacterEntityId?: number;
  renderedTileCount: Tile;
}

export interface AttachOptions {
  interactive?: boolean;
}

export interface PixiRendererApi {
  attach(viewport: HTMLElement, opts?: AttachOptions): Promise<void>;
  detach(): void;
  setArea(input: SetAreaInput): void;
  clearArea(): void;
  readonly app: Application | undefined;
  readonly engine: Engine | undefined;
}

export const PixiRendererModule = defineModule({
  client: (ctx): { api: PixiRendererApi; dispose: () => void } => {
    let app: Application | undefined;
    let engine: Engine | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let stopEngine: (() => void) | undefined;
    let scene: AreaScene | undefined;
    let viewport: HTMLElement | undefined;

    const send: SendFn = (type, value) => ctx.send(type, value);

    const clearArea: PixiRendererApi["clearArea"] = () => {
      if (scene && app) {
        app.stage.removeChild(scene);
        scene.destroy({ children: true });
      }
      scene = undefined;
    };

    const setArea: PixiRendererApi["setArea"] = (input) => {
      if (!app || !engine) {
        throw new Error("PixiRenderer must be attached before setArea");
      }
      clearArea();
      scene = new AreaScene({
        ...input,
        engine,
        rift: ctx.rift,
        send,
      });
      app.stage.addChild(scene);
    };

    const attach: PixiRendererApi["attach"] = async (target, opts) => {
      if (app) {
        throw new Error("PixiRenderer is already attached");
      }
      viewport = target;
      target.style.position = "relative";
      canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      target.prepend(canvas);

      const newApp = new Application();
      await newApp.init({
        antialias: true,
        eventMode: "none",
        roundPixels: true,
        canvas,
        resizeTo: target,
        sharedTicker: true,
      });
      newApp.resize();
      app = newApp;

      engine = new Engine(target);
      stopEngine = engine.start(opts?.interactive ?? true);
    };

    const detach: PixiRendererApi["detach"] = () => {
      clearArea();
      stopEngine?.();
      stopEngine = undefined;
      engine = undefined;
      if (app) {
        app.destroy({ removeView: false }, { children: true });
        app = undefined;
      }
      canvas?.remove();
      canvas = undefined;
      if (viewport) {
        viewport.style.position = "";
        viewport = undefined;
      }
    };

    return {
      api: {
        attach,
        detach,
        setArea,
        clearArea,
        get app() {
          return app;
        },
        get engine() {
          return engine;
        },
      },
      dispose: detach,
    };
  },
});
