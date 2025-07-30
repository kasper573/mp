import type { AccessToken } from "@mp/auth";
import type { DbClient } from "@mp/db-client";
import { InjectionContext } from "@mp/ioc";
import type { FileResolver } from "./integrations/file-resolver";

export const ctxDbClient = InjectionContext.new<DbClient>("DbClient");

export const ctxFileResolver =
  InjectionContext.new<FileResolver>("FileResolver");

export const ctxAccessToken = InjectionContext.new<AccessToken | undefined>(
  "AccessToken",
);
