import type { DbClient } from "@mp/db";
import { InjectionContext } from "@mp/ioc";
import type { AccessToken } from "@mp/oauth";
import type { TokenResolver } from "@mp/oauth/server";
import type { FileResolver } from "./integrations/file-resolver";

export const ctxDbClient = InjectionContext.new<DbClient>("DbClient");

export const ctxFileResolver =
  InjectionContext.new<FileResolver>("FileResolver");

export const ctxAccessToken = InjectionContext.new<AccessToken | undefined>(
  "AccessToken",
);

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");
