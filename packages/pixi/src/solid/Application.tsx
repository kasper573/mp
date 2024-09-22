import { Application as PixiApplication } from "pixi.js";
import { createContext, onCleanup, onMount, type JSX } from "solid-js";
import { Engine } from "../engine/engine";
import { ContainerContext } from "./ContainerContext";

export function Application(props: JSX.IntrinsicElements["div"]) {
  const canvas = document.createElement("canvas");
  const engine = new Engine(canvas);
  const app = new PixiApplication();

  let initPromise: Promise<unknown>;

  onMount(() => {
    engine.start();

    initPromise = app
      .init({ antialias: true, roundPixels: true, canvas })
      .then(() => (app.stage.interactive = true));
  });

  onCleanup(() => {
    engine.stop();
    void initPromise.then(() => {
      app.destroy(undefined, { children: true });
    });
  });

  return (
    <div style={styles.container} {...props}>
      {canvas}
      <div style={styles.content}>
        <ApplicationContext.Provider value={app}>
          <EngineContext.Provider value={engine}>
            <ContainerContext.Provider value={app.stage}>
              {props.children}
            </ContainerContext.Provider>
          </EngineContext.Provider>
        </ApplicationContext.Provider>
        ,
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "relative",
  },
  content: {
    "pointer-events": "none",
    position: "absolute",
    inset: 0,
  },
} satisfies Record<string, JSX.CSSProperties>;

export const ApplicationContext = createContext<PixiApplication>(
  new Proxy({} as PixiApplication, {
    get() {
      throw new Error("ApplicationContext not provided");
    },
  }),
);

export const EngineContext = createContext<Engine>(
  new Proxy({} as Engine, {
    get() {
      throw new Error("EngineContext not provided");
    },
  }),
);
