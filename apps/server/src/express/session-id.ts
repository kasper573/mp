import type { SessionId } from "@mp/game";
import type express from "express";

export function deriveSessionId(req: express.Request): SessionId {
  return `${req.ip}-${req.headers["user-agent"]}` as SessionId;
}
