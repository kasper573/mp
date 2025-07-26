import { characterEventRouterSlice } from "../character/events";
import { npcEventRouterSlice } from "../npc/events";
import { networkEventRouterSlice } from "./events";
import { evt } from "./event-builder";

export type GameServerEventRouter = typeof gameServerEventRouter;
export const gameServerEventRouter = evt.router({
  ...characterEventRouterSlice,
  ...networkEventRouterSlice,
  ...npcEventRouterSlice,
});
