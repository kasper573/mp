import "dotenv/config";
import { opt } from "./options";
import { registerEncoderExtensions } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import { WebSocket } from "@mp/ws/server";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting api...`);

const gatewaySocketUrl = new URL(opt.gatewayWssUrl);
gatewaySocketUrl.searchParams.set("type", "api-server");

logger.info("Creating socket");
const gatewaySocket = new WebSocket(gatewaySocketUrl);

gatewaySocket.addEventListener("close", (e) => {
  logger.error(e, "Gateway socket closed");
});

gatewaySocket.addEventListener("open", () =>
  logger.info("Gateway socket opened"),
);
