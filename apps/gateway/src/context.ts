import type { DbClient } from "@mp/db";
import type { GameEventClient } from "@mp/game-service";
import type { UserSession } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { Signal } from "@mp/state";

export const ctxUserSession = InjectionContext.new<UserSession>("userSession");

export const ctxDbClient = InjectionContext.new<DbClient>("dbClient");

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("gameEventClient");

export const ctxUserSessionSignal =
  InjectionContext.new<Signal<UserSession>>("userSessionSignal");
