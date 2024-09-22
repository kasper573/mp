import type { Container } from "pixi.js";
import { createContext } from "solid-js";

export const ContainerContext = createContext<Container>(
  new Proxy({} as Container, {
    get() {
      throw new Error("ContainerContext not provided");
    },
  }),
);
