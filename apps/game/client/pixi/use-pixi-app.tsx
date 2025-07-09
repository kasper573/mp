import { type Application } from "pixi.js";
import { createEffect, createResource, onCleanup } from "solid-js";

/**
 * solid-js and pixi.js integration
 */
export function usePixiApp(
  /**
   * You have to call app.init before returning the app.
   */
  createApp: () => Promise<Application | undefined>,
) {
  const [appResource] = createResource(async () => {
    const app = await createApp();
    onCleanup(() => {
      app?.destroy({}, { children: true });
    });
    return app;
  });

  // Must depend on the resource to ensure it's created
  createEffect(() => {
    appResource();
  });

  return appResource;
}
