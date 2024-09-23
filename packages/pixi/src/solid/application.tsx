import { Application as PixiApplication } from "pixi.js";
import type { JSX } from "solid-js";
import { createResource, onCleanup, onMount } from "solid-js";
import { Engine } from "../engine/engine";
import { ApplicationContext, EngineContext, ParentContext } from "./context";
import * as styles from "./application.css";

export function Application(props: JSX.IntrinsicElements["div"]) {
  const canvas = document.createElement("canvas");
  const engine = new Engine(canvas);
  const app = new PixiApplication();

  const [hasInitialized] = createResource(async () => {
    await app.init({ antialias: true, roundPixels: true, canvas });
    onCleanup(() => app.destroy(undefined, { children: true }));
    return true;
  });

  onMount(() => engine.start());
  onCleanup(() => engine.stop());

  return (
    <div classList={{ [styles.container]: true }} {...props}>
      {canvas}
      {hasInitialized() && (
        <ApplicationContext.Provider value={app}>
          <EngineContext.Provider value={engine}>
            <ParentContext.Provider value={app.stage}>
              <div classList={{ [styles.content]: true }}>{props.children}</div>
            </ParentContext.Provider>
          </EngineContext.Provider>
        </ApplicationContext.Provider>
      )}
    </div>
  );
}
