import { createSignal, createEffect, onCleanup } from "solid-js";
import type { ApplicationOptions } from "@mp/graphics";
import { Application } from "@mp/graphics";
import type { ReadonlySignal } from "@mp/state";

export interface UseGraphicsOptions extends Omit<
  Partial<ApplicationOptions>,
  "canvas" | "resizeTo"
> {}

/**
 * SolidJS and pixi.js integration.
 * Will return a signal that will receive the pixi application instance as soon as it's ready.
 */
export function useGraphics(
  /**
   * Must be provided for the pixi application to be initialized,
   * but can be null or undefined to allow for integration with SolidJS refs.
   */
  containerGetter: () => HTMLDivElement | null | undefined,
): ReadonlySignal<Application | undefined> {
  const [getApp, setApp] = createSignal<Application | undefined>(undefined);

  createEffect(() => {
    const container = containerGetter();
    if (!container) {
      return;
    }

    const canvas = document.createElement("canvas");
    container.prepend(canvas);
    const app = new Application();
    let mounted = true;

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
        if (mounted) {
          adjustCanvasSize(app, container);
          setApp(app);
        }
      });

    onCleanup(() => {
      mounted = false;
      setApp(undefined);
      canvas.remove();
      void initPromise.then(() => {
        app.destroy({ removeView: false }, { children: true });
      });
    });
  });

  // Create a wrapper object that implements the ReadonlySignal interface
  const signalWrapper: ReadonlySignal<Application | undefined> = {
    get: getApp,
    subscribe: (fn) => {
      // Simple subscription implementation
      let prev = getApp();
      const checkUpdate = () => {
        const current = getApp();
        if (current !== prev) {
          prev = current;
          fn(current);
        }
      };
      // Initial call
      fn(prev);
      // Poll for changes (not ideal but works for this use case)
      const interval = setInterval(checkUpdate, 16);
      return () => clearInterval(interval);
    },
  };

  return signalWrapper;
}

function adjustCanvasSize(app: Application, container: HTMLDivElement) {
  // It seems that canvas need to be absolute positioned for resizing to work properly.
  // (Without it resizing works when expanding, but not when shrinking.)
  container.style.position = "relative";
  app.canvas.style.position = "absolute";

  // Must manually call resize when changing resizeTo target to immediately apply the size
  // (otherwise it will only apply the new size on the next time the target is resized)
  app.resize();
}
