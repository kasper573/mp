import { InjectionContext } from "@mp/ioc";
import { eq } from "drizzle-orm";
import type { NpcSpawn, Npc } from "@mp/game/server";
import { npcSpawnTable, npcTable } from "../schema";
import type { DbClient } from "../client";

export class NpcService {
  constructor(private db: DbClient) {}

  async getAllSpawnsAndTheirNpcs(): Promise<
    Array<{ spawn: NpcSpawn; npc: Npc }>
  > {
    const result = await this.db
      .select()
      .from(npcSpawnTable)
      .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id));

    return result.map(({ npc, npc_spawn: spawn }) => {
      if (!npc) {
        throw new Error(`NPC spawn ${spawn.id} has no NPC`);
      }
      return { spawn, npc } as { spawn: NpcSpawn; npc: Npc };
    });
  }
}

export const ctxNpcService = InjectionContext.new<NpcService>("NpcService");
