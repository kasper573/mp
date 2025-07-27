import type { Character } from "@mp/game/server";
import { systemRoles, gatewayRoles } from "@mp/game/server";
import { opt } from "./options";
import { rpc } from "./integrations/trpc";
import { type } from "@mp/validate";
import { roles } from "./integrations/auth";
import { actorSpritesheetUrls } from "./routes/actor-spritesheet-urls";
import { myCharacterId } from "./routes/my-character-id";
import { areaFileUrl, areaFileUrls } from "./routes/area-file-urls";

export type ApiRpcRouter = typeof apiRouter;
export const apiRouter = rpc.router({
  buildVersion: rpc.procedure.query(() => opt.version),

  ping: rpc.procedure.query(() => {}),

  testError: rpc.procedure.use(roles([systemRoles.useDevTools])).query(() => {
    throw new Error("This is a test error that was thrown in the server");
  }),

  myCharacterId,
  actorSpritesheetUrls,
  areaFileUrl,
  areaFileUrls,

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .output(type("boolean"))
    .query(() => {
      return true;
    }),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input(type("boolean"))
    .mutation(() => {
      // noop
    }),

  characterList: rpc.procedure.use(roles([gatewayRoles.spectate])).query(() => {
    return {
      items: [] as Character[],
      total: 0,
    };
  }),
});
