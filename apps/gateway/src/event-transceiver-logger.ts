import type { Logger } from "@mp/logger";
import type { BinaryEventTransceiverHandleMessageResult } from "@mp/event-router";

export function logEventTransceiverResult(
  logger: Logger,
  result: BinaryEventTransceiverHandleMessageResult,
) {
  if (result?.message) {
    const [path] = result.message;
    logger.info(`[event] ${path.join(".")}`);
    if (result.receiveResult.isErr()) {
      logger.error(result.receiveResult.error, `[event] ${path.join(".")}`);
    }
  }
}
