import { evt } from "./integrations/event";
import { characterEventRouterSlice } from "./routes/character";
import { networkEventRouterSlice } from "./routes/network";
import { npcEventRouterSlice } from "./routes/npc";

export type GameServerEventRouter = typeof gameServerEventRouter;
export const gameServerEventRouter = evt.router({
  ...characterEventRouterSlice,
  ...networkEventRouterSlice,
  ...npcEventRouterSlice,
});
