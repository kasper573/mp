import { createContext } from "preact";
import type { RiftClient } from "@rift/core";
import { useContext } from "preact/hooks";
import type { GameAssetLoader } from "./game-asset-loader";

export const RiftClientContext = createContext<RiftClient | undefined>(
  undefined,
);

export function useRiftClient(): RiftClient {
  const client = useContext(RiftClientContext);
  if (!client) {
    throw new Error("RiftClientContext has not been provided");
  }
  return client;
}

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
