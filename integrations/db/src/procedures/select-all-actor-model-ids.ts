import type { DbClient } from "../client";
import { actorModelTable } from "../schema";
import type { ActorModelId } from "../types";

export async function selectAllActorModelIds(
  db: DbClient,
): Promise<ActorModelId[]> {
  const rows = await db
    .select({ id: actorModelTable.id })
    .from(actorModelTable);
  return rows.map((row) => row.id);
}
