import { Application as PixiApplication } from "pixi.js";
import type { ParentProps } from "solid-js";
import { createResource, onCleanup, onMount } from "solid-js";
import { Engine } from "../engine/engine";
import { ApplicationContext, EngineContext, ParentContext } from "./context";

export function Application(props: ParentProps) {
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
    <>
      {canvas}
      {hasInitialized() && (
        <ApplicationContext.Provider value={app}>
          <EngineContext.Provider value={engine}>
            <ParentContext.Provider value={app.stage}>
              {props.children}
            </ParentContext.Provider>
          </EngineContext.Provider>
        </ApplicationContext.Provider>
      )}
    </>
  );
}
