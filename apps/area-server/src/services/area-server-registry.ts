import type { AreaId } from "@mp/game/server";
import type { DbClient } from "../db/client";
import { sql } from "drizzle-orm";

export interface AreaServerInfo {
  areas: AreaId[];
  endpoint: string;
  healthCheck: string;
  registeredAt: Date;
}

export class AreaServerRegistry {
  constructor(private db: DbClient) {}

  async register(
    serverId: string,
    info: Omit<AreaServerInfo, "registeredAt">,
  ): Promise<void> {
    const serverInfo: AreaServerInfo = {
      ...info,
      registeredAt: new Date(),
    };

    try {
      await this.db.execute(
        sql`INSERT INTO area_server_registry (server_id, info) 
            VALUES (${serverId}, ${JSON.stringify(serverInfo)}) 
            ON CONFLICT (server_id) 
            DO UPDATE SET info = ${JSON.stringify(serverInfo)}, updated_at = NOW()`,
      );
    } catch (error) {
      // If table doesn't exist, create it
      if (error instanceof Error && error.message.includes("does not exist")) {
        await this.createTableIfNotExists();
        await this.register(serverId, info);
      } else {
        throw error;
      }
    }
  }

  private async createTableIfNotExists(): Promise<void> {
    await this.db.execute(
      sql`CREATE TABLE IF NOT EXISTS area_server_registry (
          server_id TEXT PRIMARY KEY,
          info JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW()
      )`,
    );
    await this.db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_area_server_registry_areas 
          ON area_server_registry USING GIN ((info->'areas'))`,
    );
  }

  async unregister(serverId: string): Promise<void> {
    await this.db.execute(
      sql`DELETE FROM area_server_registry WHERE server_id = ${serverId}`,
    );
  }

  async getServerForArea(
    areaId: AreaId,
  ): Promise<{ serverId: string; info: AreaServerInfo } | null> {
    const result = await this.db.execute(
      sql`SELECT server_id, info FROM area_server_registry 
          WHERE info::jsonb @> ${JSON.stringify({ areas: [areaId] })}
          ORDER BY updated_at DESC
          LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      serverId: result.rows[0].server_id as string,
      info: JSON.parse(result.rows[0].info as string),
    };
  }

  async getAllServers(): Promise<{ serverId: string; info: AreaServerInfo }[]> {
    const result = await this.db.execute(
      sql`SELECT server_id, info FROM area_server_registry ORDER BY updated_at DESC`,
    );

    return result.rows.map((row) => ({
      serverId: row.server_id as string,
      info: JSON.parse(row.info as string),
    }));
  }
}
