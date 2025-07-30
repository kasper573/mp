import type { ProxyEventInvoker } from "@mp/event-router";
import type { AreaResource } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { TokenResolver } from "@mp/oauth/server";
import type { Rng } from "@mp/std";
import type { GameStateLoader } from "./etc/game-state-loader";
import type { GameStateServer } from "./etc/game-state-server";
import type { NpcSpawner } from "./etc/npc/npc-spawner";
import type { GameServiceEvents } from "./router";

export const ctxArea = InjectionContext.new<AreaResource>("Area");

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export const ctxGameEventClient =
  InjectionContext.new<ProxyEventInvoker<GameServiceEvents>>("GameEventClient");

export const ctxRng = InjectionContext.new<Rng>("Rng");

export const ctxNpcSpawner = InjectionContext.new<NpcSpawner>("NpcSpawner");

export const ctxGameStateLoader =
  InjectionContext.new<GameStateLoader>("GameStateLoader");

export const ctxGameStateServer =
  InjectionContext.new<GameStateServer>("GameStateServer");
