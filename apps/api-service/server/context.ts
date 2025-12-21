import type { DbRepository } from "@mp/db";
import type { GameServiceConfig } from "@mp/game-shared";
import type { InjectionContainer } from "@mp/ioc";
import { InjectionContext } from "@mp/ioc";
import type { AccessToken } from "@mp/oauth";
import type { TokenResolver } from "@mp/oauth/server";
import type { Signal } from "@mp/state";
import type { FileResolver } from "./integrations/file-resolver";
import type { Logger } from "@mp/logger";

export const ctxLogger = InjectionContext.new<Logger>("logger");

export const ctxGameServiceConfig =
  InjectionContext.new<Signal<GameServiceConfig>>("gameServiceConfig");

export const ctxDb = InjectionContext.new<DbRepository>("db");

export const ctxFileResolver =
  InjectionContext.new<FileResolver>("fileResolver");

export const ctxAccessToken = InjectionContext.new<AccessToken | undefined>(
  "accessToken",
);

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("tokenResolver");

/** @gqlContext */
export interface ApiContext {
  ioc: InjectionContainer;
}
