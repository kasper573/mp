import { systemRoles } from "@mp/game/server";
import { type } from "@mp/validate";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";

const GameServiceSettings = type({
  isPatchOptimizerEnabled: "boolean",
});
type GameServiceSettings = typeof GameServiceSettings.infer;

let settings: GameServiceSettings = {
  isPatchOptimizerEnabled: true,
};

export const gameServiceSettings = rpc.procedure
  .use(roles([systemRoles.changeSettings]))
  .output(GameServiceSettings)
  .query(() => settings);

export const setGameServiceSettings = rpc.procedure
  .use(roles([systemRoles.changeSettings]))
  .input(GameServiceSettings)
  .mutation(({ input }) => {
    settings = input;
  });
