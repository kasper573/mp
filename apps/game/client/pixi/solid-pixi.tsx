import { type Application } from "pixi.js";
import {
  type JSX,
  createResource,
  onCleanup,
  createEffect,
  splitProps,
} from "solid-js";

/**
 * solid-js and pixi.js integration
 */
export function SolidPixi(
  props: {
    /**
     * You have to call app.init before returning the app.
     */
    createApp: () => Promise<Application>;
  } & JSX.HTMLAttributes<HTMLDivElement>,
) {
  const [{ createApp }, divProps] = splitProps(props, ["createApp"]);

  let container!: HTMLDivElement;

  const [appResource] = createResource(async () => {
    const app = await createApp();
    onCleanup(() => {
      app.destroy({}, { children: true });
    });
    return app;
  });

  createEffect(() => {
    if (appResource.state !== "ready") {
      return;
    }

    const app = appResource();
    app.resizeTo = container;
    app.canvas.style.position = "absolute";
    container.style.position = "relative";
    container.append(app.canvas);
    onCleanup(() => {
      container.removeChild(app.canvas);
    });
  });

  return <div ref={container} {...divProps} />;
}
