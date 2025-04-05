import { InjectionContext } from "@mp/ioc";
import type { Branded } from "@mp/std";
import type express from "express";

export type SessionId = Branded<string, "SessionId">;

export const ctxRequest = InjectionContext.new<express.Request>();

export const ctxSessionId = ctxRequest.derive(deriveSessionId);

export function deriveSessionId(req: express.Request): SessionId {
  return `${req.ip}-${req.headers["user-agent"]}` as SessionId;
}
