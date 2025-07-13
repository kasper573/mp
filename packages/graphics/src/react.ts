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
  ) => undefined | CleanupFn | CleanupFn[],
) {
  useEffect(() => {
    if (!container) {
      return;
    }

    const canvas = document.createElement("canvas");
    container.prepend(canvas);
    const app = new Application();
    const cleanupFns = normalizeCleanupFns(configureApp(app, options));
    const initPromise = app
      .init({ ...options, canvas, resizeTo: container })
      .then(() => onInitialized(app));

    return () => {
      canvas.remove();
      for (const cleanup of cleanupFns) {
        cleanup();
      }
      void initPromise.then(() =>
        app.destroy({ removeView: false }, { children: true }),
      );
    };
    // oxlint-disable-next-line exhaustive-deps A bit hacky but it works. Trust my judgement.
  }, [container, ...Object.values(options)]);

  function onInitialized(app: Application) {
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
  cleanup: undefined | CleanupFn | CleanupFn[],
): CleanupFn[] {
  if (cleanup === undefined) {
    return [];
  }
  return Array.isArray(cleanup) ? cleanup : [cleanup];
}
