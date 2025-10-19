import { Character } from "@mp/db";
import { gatewayRoles } from "@mp/keycloak";
import { ctxDbClient } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";

export const characterList = rpc.procedure
  .use(roles([gatewayRoles.spectate]))
  .query(async ({ ctx }) => {
    const db = ctx.ioc.get(ctxDbClient);
    return await db.getRepository(Character).find({
      select: ["id", "name"],
      where: { online: true },
    });
  });
