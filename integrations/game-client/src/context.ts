import { createContext } from "preact";
import type { GameAssetLoader } from "./game-asset-loader";
import type { GameStateClient } from "./game-state-client";
import { useContext } from "preact/hooks";

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

// Helper hooks for easier access to context values.
// These are actually necessary due to some preact prefresh issues.
// if we don't do this and instead destructure the context in the components directly,
// that causes hot reload in those files specifically to crash which results in a full page reload.

export const useItemDefinition: GameAssetLoader["useItemDefinition"] = (
  ...args
) => useContext(GameAssetLoaderContext).useItemDefinition(...args);

export const useAreaAssets: GameAssetLoader["useAreaAssets"] = (...args) =>
  useContext(GameAssetLoaderContext).useAreaAssets(...args);

export const useActorTextures: GameAssetLoader["useActorTextures"] = (
  ...args
) => useContext(GameAssetLoaderContext).useActorTextures(...args);
