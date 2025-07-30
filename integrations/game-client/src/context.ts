import type { Engine } from "@mp/engine";
import type { GameEventClient } from "@mp/game-service";
import { InjectionContext, MutableInjectionContainer } from "@mp/ioc";
import type { AuthClient } from "@mp/oauth/client";

export const ctxEngine = InjectionContext.new<Engine>("Engine");
export const ctxAuthClient = InjectionContext.new<AuthClient>("AuthClient");

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");
/**
 * The global injection container for the game client.
 */

export const ioc = new MutableInjectionContainer();
