import { procedure } from "../utils/procedure";
import { actorModelTable } from "../schema";

export const selectAllActorModelIds = procedure().query(async (drizzle) => {
  const rows = await drizzle
    .select({ id: actorModelTable.id })
    .from(actorModelTable);
  return rows.map((row) => row.id);
});
