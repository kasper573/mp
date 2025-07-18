import { useEffect } from "preact/hooks";
import type { ApplicationOptions } from "@mp/graphics";
import { Application } from "@mp/graphics";

export interface UseGraphicsOptions
  extends Omit<Partial<ApplicationOptions>, "canvas" | "resizeTo"> {}

/**
 * react and pixi.js integration.
 * Will reinitialize whenever any of the options change.
 */
export function useGraphics<Options extends UseGraphicsOptions>(
  /**
   * Must be provided for the pixi application to be initialized,
   * but can be null or undefined to allow for integration with react refs.
   */
  container: HTMLDivElement | null | undefined,
  options: Options,
  configureApp: (
    app: Application,
    options: Options,
    container: HTMLDivElement,
  ) => void | CleanupFn | CleanupFn[],
) {
  useEffect(() => {
    if (!container) {
      return;
    }

    const canvas = document.createElement("canvas");
    container.prepend(canvas);
    const app = new Application();
    let cleanupFns: Array<() => void>;
    const initPromise = app
      .init({ ...options, canvas, resizeTo: container })
      .then(() => {
        adjustCanvasSize(app);
        cleanupFns = normalizeCleanupFns(configureApp(app, options, container));
      });

    return () => {
      canvas.remove();

      void initPromise.then(() => {
        for (const cleanup of cleanupFns) {
          cleanup();
        }
        app.destroy({ removeView: false }, { children: true });
      });
    };
    // oxlint-disable-next-line exhaustive-deps A bit hacky but it works. Trust my judgement.
  }, [container, configureApp, ...Object.values(options)]);

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
}

type CleanupFn = () => void;

function normalizeCleanupFns(
  cleanup: void | CleanupFn | CleanupFn[],
): CleanupFn[] {
  if (!cleanup) {
    return [];
  }
  return Array.isArray(cleanup) ? cleanup : [cleanup];
}
