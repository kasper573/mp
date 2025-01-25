import { eq } from "drizzle-orm";
import type { DBClient } from "../../db/client";
import { npcSpawnTable, npcTable } from "./schema";

export class NPCService {
  constructor(private db: DBClient) {}

  async getAllSpawnsAndTheirNpcs() {
    const result = await this.db
      .select()
      .from(npcSpawnTable)
      .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id));

    return result.map(({ npc, npc_spawn: spawn }) => {
      if (!npc) {
        throw new Error(`NPC spawn ${spawn.id} has no NPC`);
      }
      return { spawn, npc };
    });
  }
}
