import type { AuthClient } from "@mp/auth/client";
import { InjectionContext } from "@mp/ioc";

export const ctxAuthClient = InjectionContext.new<AuthClient>("AuthClient");
