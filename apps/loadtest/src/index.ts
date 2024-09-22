import type { ClientStateUpdate } from "@mp/server";
import {
  serialization,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { Logger } from "@mp/logger";
import type { AreaId } from "@mp/data";
import { readCliOptions } from "./cli";

const logger = new Logger(console);
const { httpServerUrl, wsServerUrl, connections, requests } = readCliOptions();
void main();

async function main() {
  const start = performance.now();
  logger.info(`Load testing ${requests} requests x ${connections} connections`);

  await loadTestHTTP();
  await loadTestWebSockets();

  const end = performance.now();

  logger.info(`Done in ${(end - start).toFixed(2)}ms`);
}

async function loadTestHTTP() {
  await Promise.all(
    range(connections).map(async (clientNr) => {
      const results = await Promise.allSettled(
        range(requests).map(async () => {
          const res = await fetch(httpServerUrl);
          if (!res.ok) {
            throw new Error(`Error: ${res.status} ${res.statusText}`);
          }
        }),
      );

      const successes = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected").length;

      logger.info(
        `HTTP test ${clientNr} done: ${successes} successes, ${failures} failures`,
      );
    }),
  );
}

async function loadTestWebSockets() {
  await Promise.all(
    range(connections).map(async (clientNr) => {
      const client = new Client<ServerModules, ClientState, ClientStateUpdate>({
        url: wsServerUrl,
        rpcTimeout: 5000,
        createInitialState: () => ({ characters: new Map() }),
        parseStateUpdate: serialization.stateUpdate.parse,
        parseRPCResponse: serialization.rpc.parse,
        applyStateUpdate: (state, update) => Object.assign(state, update),
        serializeRPC: serialization.rpc.serialize,
      });

      const results = await Promise.allSettled(
        range(requests).map(() =>
          client.modules.area.areaFileUrl("forest" as AreaId),
        ),
      );

      const successes = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected").length;

      logger.info(
        `WebSocket test ${clientNr} done: ${successes} successes, ${failures} failures`,
      );
      client.dispose();
    }),
  );
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}
