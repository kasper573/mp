import type { CharacterId } from "@mp/world";
import type { CharacterRepository } from "./character-repo";
import type { GameServiceConfig } from "./integrations/game-service-config";
import type { InjectionContainer } from "@mp/ioc";
import { InjectionContext } from "@mp/ioc";
import type { AccessToken } from "@mp/auth";
import type { TokenResolver } from "@mp/auth/server";
import type { ReadonlySignal, Signal } from "@mp/state";
import type { FileResolver } from "./integrations/file-resolver";
import type { Logger } from "@mp/logger";

export const ctxLogger = InjectionContext.new<Logger>("logger");

export const ctxGameServiceConfig =
  InjectionContext.new<Signal<GameServiceConfig>>("gameServiceConfig");

export const ctxCharacterRepo =
  InjectionContext.new<CharacterRepository>("characterRepo");

export const ctxOnlineCharacterIds =
  InjectionContext.new<ReadonlySignal<ReadonlySet<CharacterId>>>(
    "onlineCharacterIds",
  );

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
