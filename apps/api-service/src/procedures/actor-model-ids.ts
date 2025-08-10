import { actorModelTable } from "@mp/db";
import { type } from "@mp/validate";
import { ctxDbClient } from "../context";
import { rpc } from "../integrations/trpc";

export const actorModelIds = rpc.procedure
  .output(type("string").brand("ActorModelId").array())
  .query(async ({ ctx }) => {
    const db = ctx.ioc.get(ctxDbClient);
    const rows = await db
      .select({ id: actorModelTable.id })
      .from(actorModelTable);
    return rows.map((row) => row.id);
  });
