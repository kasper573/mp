import { assert } from "@mp/std";
import { type Application } from "@mp/graphics";
import { createEffect, createResource, onCleanup } from "solid-js";

/**
 * solid-js and pixi.js integration
 */
export function usePixiApp(
  /**
   * You have to call app.init before returning the app.
   */
  createApp: () => Promise<Application | undefined>,
  options?: {
    resizeTo?: HTMLElement;
  },
) {
  const [appResource] = createResource(async () => {
    let appPromise: Promise<Application | undefined> | undefined = undefined;
    onCleanup(async () => {
      const app = await appPromise;
      app?.destroy({}, { children: true });
    });
    appPromise = createApp();
    return appPromise;
  });

  createEffect(() => {
    const app = appResource();
    if (app) {
      // Resize to the given or parent element
      app.resizeTo = options?.resizeTo ?? assert(app.canvas.parentElement);

      // It seems that canvas need to be absolute positioned for resizing to work properly.
      // (Without it resizing works when expanding, but not when shrinking.)
      app.resizeTo.style.position = "relative";
      app.canvas.style.position = "absolute";

      // Must manually call resize when changing resizeTo target to immediately apply the size
      // (otherwise it will only apply the new size on the next time the target is resized)
      app.resize();
    }
  });

  return appResource;
}
