import type { Logger } from "@mp/logger";
import {
  BinaryEventTransceiver,
  createEventRouterReceiver,
  type AnyEventRouterNode,
} from "@mp/event-router";
import type { CharacterId, UserSession, UserSessionId } from "@mp/game/server";
import type { UserId } from "@mp/auth";

export function eventRouterHandler<Context>(opt: {
  logger: Logger;
  router: AnyEventRouterNode<Context>;
  createContext: (session: UserSession) => Context;
}) {
  const receive = createEventRouterReceiver(opt.router);

  const transceiver = new BinaryEventTransceiver({ receive });

  return async (buffer: ArrayBuffer) => {
    const session: UserSession = {
      id: "" as UserSessionId,
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
      if (out.result.isErr()) {
        opt.logger.error(out.result.error, `[event] ${path.join(".")}`);
      }
    }
    return out;
  };
}
