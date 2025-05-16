import { assetsRouterSlice } from "./area/rpc";
import { characterRouterSlice } from "./character/rpc";
import { npcRouterSlice } from "./npc/rpc";
import { worldRouterSlice } from "./world/rpc";

export const gameServerRpcSlice = {
  ...characterRouterSlice,
  ...worldRouterSlice,
  ...assetsRouterSlice,
  ...npcRouterSlice,
};
