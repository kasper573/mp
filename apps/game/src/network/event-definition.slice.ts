import { characterEventRouterSlice } from "../character/events";
import { npcEventRouterSlice } from "../npc/events";
import { worldEventRouterSlice } from "../world/events";
import { eventHandlerBuilder } from "./event-definition";

export type GameServerEventRouter = typeof gameServerEventRouter;
export const gameServerEventRouter = eventHandlerBuilder.router({
  ...characterEventRouterSlice,
  ...worldEventRouterSlice,
  ...npcEventRouterSlice,
});
