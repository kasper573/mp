import type { Logger } from "@mp/logger";
import type express from "express";

export function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, _, next) => {
    logger.info("[http]", req.method, req.url);
    next();
  };
}
