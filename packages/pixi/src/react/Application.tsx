import { Application as PixiApplication } from "pixi.js";
import type { ReactNode } from "react";
import { createContext, useEffect, useState } from "react";
import { Engine } from "../engine";

export interface ApplicationProps {
  resizeTo?: HTMLDivElement | null;
  children?: ReactNode;
}

export function Application({ resizeTo, children }: ApplicationProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [app, setApp] = useState<PixiApplication>();

  useEffect(() => {
    if (!container) {
      return;
    }

    const canvas = document.createElement("canvas");
    Engine.replace(canvas);

    const app = new PixiApplication();

    container.appendChild(canvas);

    const initPromise = app.init({
      antialias: true,
      roundPixels: true,
      resizeTo: resizeTo ?? undefined,
      canvas,
    });

    void initPromise.then(() => {
      app.stage.interactive = true;
      setApp(app);
    });

    return () => {
      Engine.instance.stop();
      canvas.remove();
      void initPromise.then(() => {
        app.destroy(undefined, { children: true });
      });
    };
  }, [container, resizeTo]);

  return (
    <>
      <div ref={setContainer} />
      {app && (
        <ApplicationContext.Provider value={app}>
          {children}
        </ApplicationContext.Provider>
      )}
    </>
  );
}

export const ApplicationContext = createContext<PixiApplication>(
  new Proxy({} as PixiApplication, {
    get() {
      throw new Error("ApplicationContext not provided");
    },
  }),
);
