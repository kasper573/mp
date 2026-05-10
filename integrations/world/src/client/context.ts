import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ReadonlySignal } from "@preact/signals-core";
import type { MpRiftClient } from "../feature";
import type { GameAssetLoader } from "./game-asset-loader";

export const RiftContext = createContext(
  new Proxy({} as MpRiftClient, {
    get() {
      throw new Error("RiftContext has not been provided");
    },
  }),
);

/**
 * Subscribe a Preact component to the rift client.
 *
 * The selector receives the client and returns any `ReadonlySignal`. The
 * hook reads `.value`, so the component re-renders when the signal updates.
 *
 *   const movement = useRift((c) => c.world.signal.get(id, Movement));
 *   const ids = useRift((c) => c.world.signal.entities(Movement, AreaTag));
 */
export function useRift<T>(
  selector: (client: MpRiftClient) => ReadonlySignal<T>,
): T {
  return selector(useContext(RiftContext)).value;
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
