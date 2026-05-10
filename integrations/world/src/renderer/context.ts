import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { GameAssetLoader } from "./asset-loader";

export const GameAssetLoaderContext = createContext(
  new Proxy({} as GameAssetLoader, {
    get() {
      throw new Error("GameAssetLoaderContext has not been provided");
    },
  }),
);

export const useItemDefinition: GameAssetLoader["useItemDefinition"] = (
  ...args
) => useContext(GameAssetLoaderContext).useItemDefinition(...args);

export const useAreaAssets: GameAssetLoader["useAreaAssets"] = (...args) =>
  useContext(GameAssetLoaderContext).useAreaAssets(...args);

export const useActorTextures: GameAssetLoader["useActorTextures"] = (
  ...args
) => useContext(GameAssetLoaderContext).useActorTextures(...args);
