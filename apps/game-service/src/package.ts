import type { ProxyEventInvoker } from "@mp/event-router";
import type { GameServiceEvents } from "./router";

// Be EXTREMELY conservative about what the game service exports.
// It ideally only export types so that game clients can infer event router typedefs.
export type { GameStateEvents } from "./etc/game-state-events";
export type { GameServiceEvents as GameServerEventRouter } from "./router";
export type GameEventClient = ProxyEventInvoker<GameServiceEvents>;

// We also export event builder tools for the gateway to use to build its own router.
export { roles } from "./integrations/auth";
export { evt } from "./integrations/event-router";
