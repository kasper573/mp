import { useContext, useEffect } from "react";
import { type Container } from "pixi.js";
import { ApplicationContext } from "./Application";

export interface SceneProps<Dependencies extends unknown[]> {
  create: (...args: Dependencies) => Container;
  dependencies: Dependencies;
}

export function Scene<Dependencies extends unknown[]>({
  create,
  dependencies,
}: SceneProps<Dependencies>) {
  const app = useContext(ApplicationContext);
  useEffect(() => {
    const container = create(...dependencies);
    app.stage.addChild(container);
    return () => {
      app.stage.removeChild(container);
      container.destroy();
    };
  }, [create, ...dependencies]);
  return null;
}
