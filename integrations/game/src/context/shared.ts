import type { ProxyEventInvoker } from "@mp/event-router";
import type { GameServerEventRouter } from "../network/root-event-router";

export type GameEventClient = ProxyEventInvoker<GameServerEventRouter>;
