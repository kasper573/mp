import { InjectionContext } from "@mp/ioc";
import type { Logger } from "@mp/logger";

export const ctxLogger = InjectionContext.new<Logger>("Logger");
