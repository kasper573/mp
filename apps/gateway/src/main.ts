import "dotenv/config";
import { opt } from "./options";
import { registerEncoderExtensions } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import { WebSocketServer } from "@mp/ws/server";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);

const _ = new WebSocketServer({ port: opt.port });
