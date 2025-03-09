import { eq } from "@mp-modules/db";
import { InjectionContext } from "@mp/ioc";
import type { DBClient } from "../../../db/src/client";
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

export const ctx_npcService = InjectionContext.new<NPCService>();
