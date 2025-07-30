import { ctxUserSession } from "@mp/game-shared";
import { assert } from "@mp/std";
import { ctxGameStateServer } from "../domains/game-state-server";
import { evt } from "../package";

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
