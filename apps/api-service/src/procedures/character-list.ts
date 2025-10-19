import { e } from "@mp/db";
import { gatewayRoles } from "@mp/keycloak";
import { ctxDbClient } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";

export const characterList = rpc.procedure
  .use(roles([gatewayRoles.spectate]))
  .query(async ({ ctx }) => {
    const db = ctx.ioc.get(ctxDbClient);
    return await e
      .select(e.Character, (char) => ({
        id: char.characterId,
        name: true,
        filter: e.op(char.online, "=", true),
      }))
      .run(db);
  });
