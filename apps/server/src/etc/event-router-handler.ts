import type { Logger } from "@mp/logger";
import {
  BinaryEventTransceiver,
  createEventRouterReceiver,
  type AnyEventRouterNode,
} from "@mp/event-router";
import type {
  CharacterId,
  GameplaySession,
  GameplaySessionId,
} from "@mp/game/server";
import type { UserId } from "@mp/auth";

export function eventRouterHandler<Context>(opt: {
  logger: Logger;
  router: AnyEventRouterNode<Context>;
  createContext: (session: GameplaySession) => Context;
}) {
  const receive = createEventRouterReceiver(opt.router);

  const transceiver = new BinaryEventTransceiver({ receive });

  return async (buffer: ArrayBuffer) => {
    const session: GameplaySession = {
      id: "" as GameplaySessionId,
      roles: new Set(),
      characterId: "" as CharacterId,
      userId: "" as UserId,
    };
    const context = opt.createContext(session);
    const out = await transceiver.handleMessage(buffer, context);
    if (out?.message) {
      const [path] = out.message;
      opt.logger.info(
        {
          session,
          messageByteLength: buffer.byteLength,
          path: path.join("."),
        },
        `[event]`,
      );
      if (out.receiveResult.isErr()) {
        opt.logger.error(out.receiveResult.error, `[event] ${path.join(".")}`);
      }
    }
    return out;
  };
}
