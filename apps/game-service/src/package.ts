import type { ProxyEventInvoker } from "@mp/event-router";
import type { GameServerEventRouter } from "./domains/network/root-event-router";

// Be EXTREMELY conservative about what the game service exports.
// It ideally only export types so that game clients can infer event router typedefs.
export type { GameStateEvents } from "./domains/game-state/game-state-events";
export type { GameServerEventRouter } from "./domains/network/root-event-router";
export type GameEventClient = ProxyEventInvoker<GameServerEventRouter>;

// We also export event builder tools for the gateway to use to build its own router.
export { evt } from "./domains/network/event-builder";
export { roles } from "./domains/user/auth";
