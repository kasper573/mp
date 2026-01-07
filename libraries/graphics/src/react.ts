import { useEffect } from "preact/hooks";
import type { ApplicationOptions } from "@mp/graphics";
import { Application, Ticker } from "@mp/graphics";
import { useSignal } from "@mp/state/react";
import type { ReadonlySignal } from "@mp/state";

export interface UseGraphicsOptions extends Omit<
  Partial<ApplicationOptions>,
  "canvas" | "resizeTo"
> {}

/**
 * react and pixi.js integration.
 * Will return a signal that will receive the pixi application instance as soon as it's ready.
 */
export function useGraphics(
  /**
   * Must be provided for the pixi application to be initialized,
   * but can be null or undefined to allow for integration with react refs.
   */
  container: HTMLDivElement | null | undefined,
): ReadonlySignal<Application | undefined> {
  const appSignal = useSignal<Application>();

  useEffect(() => {
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
      })
      .then(() => {
        // Ensure Ticker.shared speed is always 1 to prevent animation speed issues
        // Some browsers or systems may incorrectly initialize this value
        Ticker.shared.speed = 1;
        
        adjustCanvasSize(app);
        appSignal.value = app;
      });

    function adjustCanvasSize(app: Application) {
      // It seems that canvas need to be absolute positioned for resizing to work properly.
      // (Without it resizing works when expanding, but not when shrinking.)
      if (container) {
        container.style.position = "relative";
      }
      app.canvas.style.position = "absolute";

      // Must manually call resize when changing resizeTo target to immediately apply the size
      // (otherwise it will only apply the new size on the next time the target is resized)
      app.resize();
    }

    return () => {
      appSignal.value = undefined;
      canvas.remove();
      void initPromise.then(() => {
        app.destroy({ removeView: false }, { children: true });
      });
    };
  }, [container, appSignal]);

  return appSignal;
}
