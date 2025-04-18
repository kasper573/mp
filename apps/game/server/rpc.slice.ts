import { areaRouterSlice, npcRouterSlice, characterRouterSlice } from ".";

export const gameServerRpcSlice = {
  ...characterRouterSlice,
  ...areaRouterSlice,
  ...npcRouterSlice,
};
