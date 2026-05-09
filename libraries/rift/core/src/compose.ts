import type { ClientTransport, ServerTransport } from "./transport";
import type { HashFn } from "./schema";
import { defineSchema } from "./schema";
import { RiftServer, type VisibilityFn } from "./server";
import { RiftClient } from "./client";
import type { World } from "./world";
import {
  type Cleanup,
  type Feature,
  type ReactiveWorld,
  normalizeCleanup,
} from "./feature";

export interface CreateServerOptions {
  readonly transport: ServerTransport;
  readonly hash: HashFn;
  readonly tickRateHz?: number;
  readonly handshakeTimeoutMs?: number;
  readonly visibility?: VisibilityFn;
  readonly features: readonly Feature[];
}

export function createServer(opts: CreateServerOptions): RiftServer {
  const components = opts.features.flatMap((f) => f.components ?? []);
  const events = opts.features.flatMap((f) => f.events ?? []);
  const schema = defineSchema({ components, events, hash: opts.hash });
  const server = new RiftServer({
    schema,
    transport: opts.transport,
    tickRateHz: opts.tickRateHz,
    handshakeTimeoutMs: opts.handshakeTimeoutMs,
    visibility: opts.visibility,
  });

  const cleanups: Cleanup[] = [];
  const origStart = server.start.bind(server);
  const origStop = server.stop.bind(server);

  server.start = async (): Promise<void> => {
    // Feature setups run BEFORE the underlying start so subscribers are
    // in place before the transport begins delivering messages and before
    // the first tick fires.
    for (const f of opts.features) {
      if (!f.server) continue;
      // oxlint-disable-next-line no-await-in-loop -- sequential init respects feature order
      const r = await f.server(server);
      const cleanup = normalizeCleanup(r);
      if (cleanup) cleanups.push(cleanup);
    }
    await origStart();
  };

  server.stop = async (code?: number, reason?: string): Promise<void> => {
    for (const c of [...cleanups].reverse()) {
      // oxlint-disable-next-line no-await-in-loop -- reverse-order teardown
      await c();
    }
    cleanups.length = 0;
    await origStop(code, reason);
  };

  return server;
}

export interface CreateClientOptions {
  readonly transport: ClientTransport;
  readonly hash: HashFn;
  readonly features: readonly Feature[];
  readonly attachReactive: (world: World) => ReactiveWorld;
}

export interface ComposedClient {
  readonly client: RiftClient;
  readonly reactive: ReactiveWorld;
}

export function createClient(opts: CreateClientOptions): ComposedClient {
  const components = opts.features.flatMap((f) => f.components ?? []);
  const events = opts.features.flatMap((f) => f.events ?? []);
  const schema = defineSchema({ components, events, hash: opts.hash });
  const client = new RiftClient({ schema, transport: opts.transport });
  const reactive = opts.attachReactive(client.world);

  const cleanups: Cleanup[] = [];
  const origConnect = client.connect.bind(client);
  const origDisconnect = client.disconnect.bind(client);

  client.connect = async (): Promise<void> => {
    await origConnect();
    for (const f of opts.features) {
      if (!f.client) continue;
      // oxlint-disable-next-line no-await-in-loop -- sequential init respects feature order
      const r = await f.client(client, reactive);
      const cleanup = normalizeCleanup(r);
      if (cleanup) cleanups.push(cleanup);
    }
  };

  client.disconnect = async (code?: number, reason?: string): Promise<void> => {
    for (const c of [...cleanups].reverse()) {
      // oxlint-disable-next-line no-await-in-loop -- reverse-order teardown
      await c();
    }
    cleanups.length = 0;
    await origDisconnect(code, reason);
  };

  return { client, reactive };
}
