import type {
  ActorModelLookup,
  AreaResource,
  GameState,
  UserSession,
} from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { Logger } from "@mp/logger";
import type { TokenResolver } from "@mp/oauth/server";
import type { Rng } from "@mp/std";
import type { GameStateLoader } from "./etc/game-state-loader";
import type { GameStateServer } from "./etc/game-state-server";
import type { NpcSpawner } from "./etc/npc/npc-spawner";
import type { GameEventClient } from "./package";

export const ctxArea = InjectionContext.new<AreaResource>("AreaResource");

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");

export const ctxRng = InjectionContext.new<Rng>("Rng");

export const ctxNpcSpawner = InjectionContext.new<NpcSpawner>("NpcSpawner");

export const ctxGameStateLoader =
  InjectionContext.new<GameStateLoader>("GameStateLoader");

export const ctxGameStateServer =
  InjectionContext.new<GameStateServer>("GameStateServer");

export const ctxActorModelLookup =
  InjectionContext.new<ActorModelLookup>("ActorModelLookup");

export const ctxGameState = InjectionContext.new<GameState>("GameState");

export const ctxLogger = InjectionContext.new<Logger>("Logger");

export const ctxUserSession = InjectionContext.new<UserSession>("UserSession");
