import type {
  ActorModelLookup,
  AreaResource,
  GameState,
  ItemDefinitionLookup,
  UserSession,
} from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { Logger } from "@mp/logger";
import type { TokenResolver } from "@mp/oauth/server";
import type { Rng } from "@mp/std";
import type { GameStateServer } from "./etc/game-state-server";
import type { NpcSpawner } from "./etc/npc/npc-spawner";
import type { GameEventClient } from "./package";
import type { DbClient } from "@mp/db";

export const ctxArea = InjectionContext.new<AreaResource>("AreaResource");

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");

export const ctxRng = InjectionContext.new<Rng>("Rng");

export const ctxNpcSpawner = InjectionContext.new<NpcSpawner>("NpcSpawner");

export const ctxDbClient = InjectionContext.new<DbClient>("dbClient");

export const ctxGameStateServer =
  InjectionContext.new<GameStateServer>("GameStateServer");

export const ctxActorModelLookup =
  InjectionContext.new<ActorModelLookup>("ActorModelLookup");

export const ctxItemDefinitionLookup =
  InjectionContext.new<ItemDefinitionLookup>("ItemDefinitionLookup");

export const ctxGameState = InjectionContext.new<GameState>("GameState");

export const ctxLogger = InjectionContext.new<Logger>("Logger");

export const ctxUserSession = InjectionContext.new<UserSession>("UserSession");
