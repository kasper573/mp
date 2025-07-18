import { rpc } from "@mp/game/server";
import type { AreaId } from "@mp/game/server";
import { createDbClient } from "../db/client";
import { AreaServerRegistry } from "../services/area-server-registry";
import { opt } from "../options";

export type AreaServerDiscoveryRouter = typeof areaServerDiscoveryRouter;

export const areaServerDiscoveryRouter = rpc.router({
  getServerForArea: rpc.procedure
    .input<AreaId>()
    .output<{ endpoint: string } | null>()
    .query(async ({ input: areaId }) => {
      const db = createDbClient(opt.databaseUrl);
      const registry = new AreaServerRegistry(db);
      
      const serverInfo = await registry.getServerForArea(areaId);
      if (!serverInfo) {
        return null;
      }

      return {
        endpoint: serverInfo.info.endpoint,
      };
    }),

  getAllServers: rpc.procedure
    .output<{ serverId: string; areas: AreaId[]; endpoint: string }[]>()
    .query(async () => {
      const db = createDbClient(opt.databaseUrl);
      const registry = new AreaServerRegistry(db);
      
      const servers = await registry.getAllServers();
      return servers.map(server => ({
        serverId: server.serverId,
        areas: server.info.areas,
        endpoint: server.info.endpoint,
      }));
    }),
});