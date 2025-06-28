import type { Logger } from "@mp/logger";
import type express from "express";

export function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, res, next) => {
    logger.info({ method: req.method, url: req.url }, `[http]`);
    next();
  };
}
