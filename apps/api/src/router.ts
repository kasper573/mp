import { systemRoles } from "@mp/game/server";
import { type } from "@mp/validate";
import { roles } from "./integrations/auth";
import { rpc } from "./integrations/trpc";
import { opt } from "./options";
import { actorSpritesheetUrls } from "./routes/actor-spritesheet-urls";
import { areaFileUrl, areaFileUrls } from "./routes/area-file-urls";
import { characterList } from "./routes/character-list";
import { myCharacterId } from "./routes/my-character-id";

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
  characterList,

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
});
