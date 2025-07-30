import { GameServiceConfig } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import { systemRoles } from "@mp/keycloak";
import type { Signal } from "@mp/state";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";

export const gameServiceSettings = rpc.procedure
  .use(roles([systemRoles.changeSettings]))
  .output(GameServiceConfig)
  .query(({ ctx }) => ctx.ioc.get(ctxGameServiceConfig).value);

export const setGameServiceSettings = rpc.procedure
  .use(roles([systemRoles.changeSettings]))
  .input(GameServiceConfig)
  .mutation(({ ctx, input }) => {
    const config = ctx.ioc.get(ctxGameServiceConfig);
    config.value = input;
  });

export const ctxGameServiceConfig =
  InjectionContext.new<Signal<GameServiceConfig>>("GameServiceConfig");
