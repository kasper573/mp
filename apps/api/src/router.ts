import { systemRoles } from "@mp/game/server";
import { roles } from "./integrations/auth";
import { rpc } from "./integrations/trpc";
import { opt } from "./options";
import { actorSpritesheetUrls } from "./routes/actor-spritesheet-urls";
import { areaFileUrl, areaFileUrls } from "./routes/area-file-urls";
import { characterList } from "./routes/character-list";
import {
  gameServiceSettings,
  setGameServiceSettings,
} from "./routes/game-service-settings";
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
  gameServiceSettings,
  setGameServiceSettings: setGameServiceSettings,
});
