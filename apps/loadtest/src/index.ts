import { createConsoleLogger } from "@mp/logger";

const logger = createConsoleLogger();

logger.warn(
  "loadtest is temporarily a no-op while the rift transport rewrite lands. " +
    "It will be reimplemented on top of @rift/modular GameClient in a follow-up phase.",
);
