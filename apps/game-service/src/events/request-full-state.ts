import { assert } from "@mp/std";
import { ctxGameStateServer, ctxUserSession } from "../context";
import { evt } from "../integrations/event-router";

export const requestFullState = evt.event.handler(({ ctx }) => {
  const session = ctx.get(ctxUserSession);
  const server = ctx.get(ctxGameStateServer);
  server.markToResendFullState(
    assert(
      session.characterId,
      "Cannot resend full game state, user session has no character id",
    ),
  );
});
