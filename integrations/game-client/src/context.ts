import { createContext } from "preact";
import type { GameAssetLoader } from "./game-asset-loader";
import type { GameStateClient } from "./game-state-client";

export const GameStateClientContext = createContext(
  new Proxy({} as GameStateClient, {
    get() {
      throw new Error("GameStateClientContext has not been provided");
    },
  }),
);

export const GameAssetLoaderContext = createContext(
  new Proxy({} as GameAssetLoader, {
    get() {
      throw new Error("GameAssetLoaderContext has not been provided");
    },
  }),
);
