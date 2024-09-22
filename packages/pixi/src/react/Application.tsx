import { Application as PixiApplication } from "pixi.js";
import type { CSSProperties, ReactNode } from "react";
import { createContext, useEffect, useState } from "react";
import { Engine } from "../engine/engine";
import { ContainerContext } from "./Pixi";

export interface ApplicationProps {
  resizeTo?: HTMLDivElement | null;
  children?: ReactNode;
}

export function Application({ resizeTo, children }: ApplicationProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [instances, setInstances] = useState<[PixiApplication, Engine]>();

  useEffect(() => {
    if (!container) {
      return;
    }

    const canvas = document.createElement("canvas");
    const engine = new Engine(canvas);
    engine.start();
    const app = new PixiApplication();

    container.prepend(canvas);

    const initPromise = app.init({
      antialias: true,
      roundPixels: true,
      resizeTo: resizeTo ?? undefined,
      canvas,
    });

    void initPromise.then(() => {
      app.stage.interactive = true;
      setInstances([app, engine]);
    });

    return () => {
      engine.stop();
      canvas.remove();
      void initPromise.then(() => {
        app.destroy(undefined, { children: true });
      });
    };
  }, [container, resizeTo]);

  return (
    <>
      <div style={styles.container} ref={setContainer}>
        {instances && (
          <div style={styles.content}>
            <ApplicationContext.Provider value={instances[0]}>
              <EngineContext.Provider value={instances[1]}>
                <ContainerContext.Provider value={instances[0].stage}>
                  {children}
                </ContainerContext.Provider>
              </EngineContext.Provider>
            </ApplicationContext.Provider>
          </div>
        )}
      </div>
    </>
  );
}

const styles = {
  container: {
    position: "relative",
  },
  content: {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
  },
} satisfies Record<string, CSSProperties>;

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
