import type { Logger } from "@mp/logger";
import {
  BinaryEventTransceiver,
  createEventRouterReceiver,
  type AnyEventRouterNode,
} from "@mp/event-router";
import type { ClientId } from "@mp/sync";

export function eventRouterHandler<Context>(opt: {
  logger: Logger;
  router: AnyEventRouterNode<Context>;
  createContext: (clientId: ClientId) => Context;
}) {
  const receive = createEventRouterReceiver(opt.router);

  const transceiver = new BinaryEventTransceiver({ receive });

  return async (buffer: ArrayBuffer) => {
    const clientId: ClientId = "unknown" as ClientId; // TODO determine client id
    const context = opt.createContext(clientId);
    const out = await transceiver.handleMessage(buffer, context);
    if (out?.message) {
      const [path] = out.message;
      opt.logger.info(
        {
          clientId,
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
