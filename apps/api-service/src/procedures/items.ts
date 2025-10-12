import { eq, itemTable } from "@mp/db";
import { gatewayRoles } from "@mp/keycloak";
import { type } from "@mp/validate";
import { ctxDbClient } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";

export const item = rpc.procedure
  .use(roles([gatewayRoles.join]))
  .input(type("string").brand("ItemId"))
  .query(async ({ ctx, input }): Promise<typeof itemTable.$inferSelect> => {
    const db = ctx.ioc.get(ctxDbClient);
    const res = await db
      .select()
      .from(itemTable)
      .where(eq(itemTable.id, input))
      .limit(1);

    if (!res.length) {
      throw new Error(`Item with id ${input} not found`);
    }

    return res[0];
  });
