import { eq } from "@mp/db";
import { InjectionContext } from "@mp/ioc";
import type { DbClient } from "@mp/db";
import { npcSpawnTable, npcTable } from "./schema";

export class NpcService {
  constructor(private db: DbClient) {}

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

export const ctxNpcService = InjectionContext.new<NpcService>("NpcService");
