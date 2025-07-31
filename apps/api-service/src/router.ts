import { systemRoles } from "@mp/keycloak";
import { roles } from "./integrations/auth";
import { rpc } from "./integrations/trpc";
import { opt } from "./options";
import { actorModelIds } from "./procedures/actor-model-ids";
import { actorSpritesheetUrl } from "./procedures/actor-spritesheet-url";
import { areaFileUrl, areaFileUrls } from "./procedures/area-file-urls";
import { characterList } from "./procedures/character-list";
import {
  gameServiceSettings,
  setGameServiceSettings,
} from "./procedures/game-service-settings";
import { myCharacterId } from "./procedures/my-character-id";

export type ApiRpcRouter = typeof apiRouter;
export const apiRouter = rpc.router({
  buildVersion: rpc.procedure.query(() => opt.version),

  ping: rpc.procedure.query(() => {}),

  testError: rpc.procedure.use(roles([systemRoles.useDevTools])).query(() => {
    throw new Error("This is a test error that was thrown in the server");
  }),

  myCharacterId,
  actorSpritesheetUrl,
  actorModelIds,
  areaFileUrl,
  areaFileUrls,
  characterList,
  gameServiceSettings,
  setGameServiceSettings: setGameServiceSettings,
});
