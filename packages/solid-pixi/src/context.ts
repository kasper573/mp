import type { Container, Application } from "@mp/pixi";
import type { Engine } from "@mp/engine";
import { createContext } from "solid-js";

export const ParentContext = createContext<Container>(
  new Proxy({} as Container, {
    get() {
      throw new Error("ParentContext not provided");
    },
  }),
);

export const ApplicationContext = createContext<Application>(
  new Proxy({} as Application, {
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
