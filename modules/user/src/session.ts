import { InjectionContext } from "@mp/injector";
import type { Branded } from "@mp/std";
import type express from "express";

export type SessionId = Branded<string, "SessionId">;

export const requestContext = InjectionContext.new<express.Request>();

export const sessionIdContext = requestContext.derive(deriveSessionId);

export function deriveSessionId(req: express.Request): SessionId {
  return `${req.ip}-${req.headers["user-agent"]}` as SessionId;
}
