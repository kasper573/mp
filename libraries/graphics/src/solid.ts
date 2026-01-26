import type { Accessor } from "solid-js";
import { createEffect, onCleanup } from "solid-js";
import type { ApplicationOptions } from "@mp/graphics";
import { Application } from "@mp/graphics";
import { signal } from "@mp/state/solid";
import type { ReadonlySignal } from "@mp/state";

export interface UseGraphicsOptions
  extends Omit<Partial<ApplicationOptions>, "canvas" | "resizeTo"> {}

export function useGraphics(
  containerAccessor: Accessor<HTMLDivElement | null | undefined>,
): ReadonlySignal<Application | undefined> {
  const appSignal = signal<Application | undefined>(undefined);

  createEffect(() => {
    const container = containerAccessor();
    if (!container) {
      return;
    }

    const canvas = document.createElement("canvas");
    container.prepend(canvas);
    const app = new Application();
    const initPromise = app
      .init({
        antialias: true,
        eventMode: "none",
        roundPixels: true,
        canvas,
        resizeTo: container,
        sharedTicker: true,
      })
      .then(() => {
        adjustCanvasSize(app);
        appSignal.set(app);
      });

    function adjustCanvasSize(app: Application) {
      if (container) {
        container.style.position = "relative";
      }
      app.canvas.style.position = "absolute";
      app.resize();
    }

    onCleanup(() => {
      appSignal.set(undefined);
      canvas.remove();
      void initPromise.then(() => {
        app.destroy({ removeView: false }, { children: true });
      });
    });
  });

  return appSignal;
}
