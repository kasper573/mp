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
    onCleanup(() => {
      app?.destroy({}, { children: true });
    });
    const app = await createApp();
    return app;
  });

  // Must depend on the resource to ensure it's created
  createEffect(() => {
    appResource();
  });

  return appResource;
}
