import { DbClient } from "../client";
import { actorModelTable } from "../schema";
import type { ActorModelId } from "@mp/game-shared";

export async function selectAllActorModelIds(
  db: DbClient,
): Promise<ActorModelId[]> {
  const drizzle = DbClient.unwrap(db);
  const rows = await drizzle
    .select({ id: actorModelTable.id })
    .from(actorModelTable);
  return rows.map((row) => row.id);
}
