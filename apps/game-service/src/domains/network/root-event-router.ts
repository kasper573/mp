import { characterEventRouterSlice } from "../character/events";
import { npcEventRouterSlice } from "../npc/events";
import { evt } from "./event-builder";
import { networkEventRouterSlice } from "./events";

export type GameServerEventRouter = typeof gameServerEventRouter;
export const gameServerEventRouter = evt.router({
  ...characterEventRouterSlice,
  ...networkEventRouterSlice,
  ...npcEventRouterSlice,
});
