import type { Logger } from "@mp/logger";
import {
  BinaryEventTransceiver,
  createEventRouterReceiver,
  type AnyEventRouterNode,
} from "@mp/event-router";
import type { UserSession } from "@mp/game/server";

export function eventRouterHandler<Context>(opt: {
  logger: Logger;
  router: AnyEventRouterNode<Context>;
  createContext: (session: UserSession) => Context;
}) {
  const receive = createEventRouterReceiver(opt.router);

  const transceiver = new BinaryEventTransceiver({ receive });

  return async (buffer: ArrayBuffer) => {
    const session: UserSession = { id: "" };
    const out = await transceiver.handleMessage(buffer, () =>
      opt.createContext(session),
    );
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
