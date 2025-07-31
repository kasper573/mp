import { GameServiceConfig } from "@mp/game-shared";
import { systemRoles } from "@mp/keycloak";
import { ctxGameServiceConfig } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";

export const gameServiceSettings = rpc.procedure
  .use(roles([systemRoles.changeSettings]))
  .output(GameServiceConfig)
  .query(({ ctx: { ioc } }) => ioc.get(ctxGameServiceConfig).value);

export const setGameServiceSettings = rpc.procedure
  .use(roles([systemRoles.changeSettings]))
  .input(GameServiceConfig)
  .mutation(({ ctx: { ioc }, input }) => {
    const config = ioc.get(ctxGameServiceConfig);
    config.value = input;
  });
