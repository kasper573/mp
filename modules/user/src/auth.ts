import { InjectionContext } from "@mp/injector";
import type { AuthToken } from "@mp/auth";
import type { AuthServer } from "@mp/auth/server";
import type express from "express";
import { requestContext } from "./session";

export const authTokenHeaderName = "token";

export const authServerContext = InjectionContext.new<AuthServer>();

export const authTokenContext = requestContext.derive(deriveAuthToken);

export function deriveAuthToken(req: express.Request) {
  return String(req.headers[authTokenHeaderName]) as AuthToken | undefined;
}
