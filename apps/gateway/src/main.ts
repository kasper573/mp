// Note that this file is an entrypoint and should not have any exports

import { opt } from "./options";
import { registerEncoderExtensions } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);
