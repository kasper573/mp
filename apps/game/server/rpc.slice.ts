import { areaRouterSlice, npcRouterSlice, characterRouterSlice } from ".";

export const gameRpcSlice = {
  ...characterRouterSlice,
  ...areaRouterSlice,
  ...npcRouterSlice,
};
