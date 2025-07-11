import { assert } from "@mp/std";
import type { ApplicationOptions } from "@mp/graphics";
import { Application } from "@mp/graphics";
import { useEffect } from "react";

// We allow nullish for easier integration with react refs
export interface UseGraphicsOptions
  extends Omit<Partial<ApplicationOptions>, "canvas" | "resizeTo"> {
  /**
   * Must be provided for the pixi application to be initialized,
   * but can be null or undefined to allow for integration with react refs.
   */
  canvas?: HTMLCanvasElement | null;
  resizeTo?: HTMLElement | null;
}

/**
 * react and pixi.js integration
 */
export function useGraphics(
  options: UseGraphicsOptions,
  configureApp: (
    app: Application,
    canvas: HTMLCanvasElement,
  ) => undefined | CleanupFn | CleanupFn[],
) {
  useEffect(() => {
    const { canvas, ...rest } = options;
    if (!canvas) {
      return;
    }

    const app = new Application();
    const cleanupFns = normalizeCleanupFns(configureApp(app, canvas));
    const initPromise = app
      .init({
        ...rest,
        canvas,
        resizeTo: options.resizeTo ?? undefined,
      })
      .then(() => onInitialized(app));

    return () => {
      for (const cleanup of cleanupFns) {
        cleanup();
      }
      void initPromise.then(() => app.destroy({}, { children: true }));
    };
  }, Object.values(options));

  function onInitialized(app: Application) {
    // Resize to the given or parent element
    app.resizeTo = options.resizeTo ?? assert(app.canvas.parentElement);

    // It seems that canvas need to be absolute positioned for resizing to work properly.
    // (Without it resizing works when expanding, but not when shrinking.)
    app.resizeTo.style.position = "relative";
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

type MakeNullish<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: T[P] | null | undefined;
};
