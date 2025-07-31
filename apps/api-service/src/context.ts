import type { DbClient } from "@mp/db";
import type { GameServiceConfig } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { AccessToken } from "@mp/oauth";
import type { TokenResolver } from "@mp/oauth/server";
import type { Signal } from "@mp/state";
import type { FileResolver } from "./integrations/file-resolver";

export const ctxGameServiceConfig =
  InjectionContext.new<Signal<GameServiceConfig>>("gameServiceConfig");
export const ctxDbClient = InjectionContext.new<DbClient>("dbClient");
export const ctxFileResolver =
  InjectionContext.new<FileResolver>("fileResolver");
export const ctxAccessToken = InjectionContext.new<AccessToken | undefined>(
  "accessToken",
);
export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("tokenResolver");
