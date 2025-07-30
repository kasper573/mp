import type { ProxyEventInvoker } from "@mp/event-router";
import type { GameServerEventRouter } from "./router";

// Be EXTREMELY conservative about what the game service exports.
// It ideally only export types so that game clients can infer event router typedefs.
export type { GameStateEvents } from "./domains/game-state-events";
export type { GameServerEventRouter } from "./router";
export type GameEventClient = ProxyEventInvoker<GameServerEventRouter>;

// We also export event builder tools for the gateway to use to build its own router.
export { roles } from "./integrations/auth";
export { evt } from "./integrations/event";
