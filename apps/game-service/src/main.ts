import { RiftServer } from "@rift/core";
import { GameServer } from "@rift/modular";
import { WebSocketServer } from "ws";
import { world, modules } from "@mp/world";
import { createConsoleLogger } from "@mp/logger";

const logger = createConsoleLogger();

const port = Number(process.env.MP_GAME_SERVICE_PORT ?? "8090");
const tiledBaseUrl =
  process.env.MP_GAME_SERVICE_TILED_BASE_URL ?? "https://files.mp.localhost/";

const wss = new WebSocketServer({ port });
const rift = new RiftServer(world);

const server = new GameServer({
  modules,
  rift,
  wss,
  tickRate: 20,
  values: { tiledBaseUrl },
});

await server.start();

logger.info(`Game service connected on port ${port}`);
