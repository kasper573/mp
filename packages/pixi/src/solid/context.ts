import type { Container, Application } from "pixi.js";
import { createContext } from "solid-js";
import type { Engine } from "../engine/engine";

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
