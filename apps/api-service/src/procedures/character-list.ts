import { selectOnlineCharacterList } from "@mp/db";
import { gatewayRoles } from "@mp/keycloak";
import { ctxDbClient } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";

export const characterList = rpc.procedure
  .use(roles([gatewayRoles.spectate]))
  .query(({ ctx }) => selectOnlineCharacterList(ctx.ioc.get(ctxDbClient)));
