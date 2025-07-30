import { characterTable, eq } from "@mp/db";
import { gatewayRoles } from "@mp/keycloak";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { ctxDbClient } from "../ioc";

export const characterList = rpc.procedure
  .use(roles([gatewayRoles.spectate]))
  .query(async ({ ctx }) => {
    const db = ctx.ioc.get(ctxDbClient);
    return await db
      .select({ id: characterTable.id, name: characterTable.name })
      .from(characterTable)
      .where(eq(characterTable.online, true));
  });
