import { characterEventRouterSlice } from "../character/events";
import { npcEventRouterSlice } from "../npc/events";
import { worldEventRouterSlice } from "../world/events";
import type { AnyEventNodeRecord, EventRouterNode } from "@mp/event-router";

export type GameServerEventRouter = EventRouterNode<
  typeof gameServerEventSlice
>;
export const gameServerEventSlice = {
  ...characterEventRouterSlice,
  ...worldEventRouterSlice,
  ...npcEventRouterSlice,
} satisfies AnyEventNodeRecord;
