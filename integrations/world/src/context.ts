import { createContext } from "preact";
import type { GameClient } from "@rift/modular";
import type { GameAssetLoader } from "./game-asset-loader";
import { useContext } from "preact/hooks";
import { sessionModule } from "./modules/session/module";
import { movementModule } from "./modules/movement/module";
import { combatModule } from "./modules/combat/module";
import { inventoryModule } from "./modules/inventory/module";

export const GameClientContext = createContext(
  new Proxy({} as GameClient, {
    get() {
      throw new Error("GameClientContext has not been provided");
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

// Module access hooks — needed to avoid preact prefresh issues
// (destructuring context directly in components causes hot reload crashes)

export const useSession = () =>
  useContext(GameClientContext).using(sessionModule);

export const useMovement = () =>
  useContext(GameClientContext).using(movementModule);

export const useCombat = () =>
  useContext(GameClientContext).using(combatModule);

export const useInventory = () =>
  useContext(GameClientContext).using(inventoryModule);

export const useAreaAssets: GameAssetLoader["useAreaAssets"] = (...args) =>
  useContext(GameAssetLoaderContext).useAreaAssets(...args);

export const useActorTextures: GameAssetLoader["useActorTextures"] = (
  ...args
) => useContext(GameAssetLoaderContext).useActorTextures(...args);
