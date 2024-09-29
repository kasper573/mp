import type { Container, Application } from "@mp/pixi";
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
