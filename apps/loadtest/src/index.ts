import type { CharacterId, ClientStateUpdate } from "@mp/server";
import {
  serialization,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { Logger } from "@mp/logger";
import type { AreaId } from "../../../packages/state/src";
import { readCliOptions } from "./cli";

const logger = new Logger(console);
const { httpServerUrl, wsServerUrl, connections, requests } = readCliOptions();
main();

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
        createInitialState: () => ({ characters: new Map() }),
        parseStateUpdate: serialization.stateUpdate.parse,
        parseRPCOutput: serialization.rpc.parse,
        createNextState: (_, nextState) => nextState,
        serializeRPC: serialization.rpc.serialize,
        getAuth: () => ({
          token: `loadtest_client_${clientNr}` as CharacterId,
        }),
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
