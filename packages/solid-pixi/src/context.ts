import type { Container } from "@mp/pixi";
import { type Context, createContext } from "solid-js";

export const ParentContext: Context<Container> = createContext(
  new Proxy({} as Container, {
    get() {
      throw new Error("ParentContext not provided");
    },
  }),
);
