import { evt } from "./event-builder";
import { ctxGameStateServer } from "../game-state/game-state-server";
import { ctxUserSession } from "../user/session";

export type NetworkRouter = typeof networkEventRouter;
export const networkEventRouter = evt.router({
  requestFullState: evt.event.handler(({ ctx }) => {
    const session = ctx.get(ctxUserSession);
    const server = ctx.get(ctxGameStateServer);
    server.markToResendFullState(session.characterId);
  }),
});

export const networkEventRouterSlice = { network: networkEventRouter };
