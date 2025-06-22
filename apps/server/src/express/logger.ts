import type { Logger } from "@mp/logger";
import type express from "express";

export function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, res, next) => {
    logger.info(`[http] ${req.method} ${req.url}`);
    next();
  };
}
