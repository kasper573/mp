import { Application as PixiApplication } from "@mp/pixi";
import type { JSX } from "solid-js";
import { createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { clsx } from "@mp/style";
import { Engine } from "@mp/engine";
import { ApplicationContext, EngineContext, ParentContext } from "./context";
import * as styles from "./application.css";

export function Application(props: JSX.IntrinsicElements["div"]) {
  const [getViewport, setViewport] = createSignal<HTMLElement | null>(null);
  const [getCanvas, setCanvas] = createSignal<HTMLCanvasElement | null>(null);
  const elements = createMemo(() => [getViewport(), getCanvas()] as const);

  const [instances] = createResource(elements, async ([viewport, canvas]) => {
    if (!viewport || !canvas) {
      return;
    }

    const engine = new Engine(viewport);
    const app = new PixiApplication();

    await app.init({
      antialias: true,
      resizeTo: viewport,
      roundPixels: true,
      canvas,
    });

    engine.start();

    onCleanup(() => {
      engine.stop();
      app.destroy(undefined, { children: true });
    });

    return { engine, app };
  });

  return (
    <div
      ref={setViewport}
      {...props}
      class={clsx(styles.container, props.class)}
    >
      <canvas ref={setCanvas} />
      {instances.state === "ready" && instances.latest && (
        <ApplicationContext.Provider value={instances.latest.app}>
          <EngineContext.Provider value={instances.latest.engine}>
            <ParentContext.Provider value={instances.latest.app.stage}>
              <div class={styles.content}>{props.children}</div>
            </ParentContext.Provider>
          </EngineContext.Provider>
        </ApplicationContext.Provider>
      )}
    </div>
  );
}
