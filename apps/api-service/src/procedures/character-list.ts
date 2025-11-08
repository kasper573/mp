import { gatewayRoles } from "@mp/keycloak";
import { ctxDb } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { promiseFromResult } from "@mp/std";

export const characterList = rpc.procedure
  .use(roles([gatewayRoles.spectate]))
  .query(({ ctx }) =>
    promiseFromResult(ctx.ioc.get(ctxDb).selectOnlineCharacterList()),
  );
