import type { DbClient } from "@mp/db-client";
import { InjectionContext } from "@mp/ioc";

export const ctxDbClient = InjectionContext.new<DbClient>("DbClient");
