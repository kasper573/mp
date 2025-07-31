import type { Engine } from "@mp/engine";
import type { GameEventClient } from "@mp/game-service";
import type { ActorModelLookup, ActorSpritesheetLookup } from "@mp/game-shared";
import { InjectionContext, MutableInjectionContainer } from "@mp/ioc";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { GameStateClient } from "./game-state-client";

export const ctxEngine = InjectionContext.new<Engine>("Engine");
export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");
export const ctxGameStateClient =
  InjectionContext.new<GameStateClient>("GameStateClient");
export const ctxAreaSpritesheets = InjectionContext.new<TiledSpritesheetRecord>(
  "TiledSpritesheetRecord",
);
export const ctxActorSpritesheetLookup =
  InjectionContext.new<ActorSpritesheetLookup>("ActorSpritesheetLookup");
export const ctxActorModelLookup =
  InjectionContext.new<ActorModelLookup>("ActorModelLookup");

/**
 * The global injection container for the game client.
 */

export const ioc = new MutableInjectionContainer();
