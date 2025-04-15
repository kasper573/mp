import { InjectionContext } from "@mp/ioc";
import type { Branded } from "@mp/std";

export type SessionId = Branded<string, "SessionId">;

export const ctxSessionId = InjectionContext.new<SessionId>();
