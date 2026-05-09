import type { ClientTransport, ServerTransport } from "@rift/core";
import {
  defineSchema,
  type HashFn,
  RiftClient,
  RiftServer,
  type VisibilityFn,
} from "@rift/core";
import type { ReactiveWorld } from "@rift/reactive";
import type { World } from "@rift/core";
import type { RiftType } from "@rift/types";

export type Cleanup = () => void | Promise<void>;

export interface Module {
  stop(): void | Promise<void>;
}

// oxlint-disable-next-line typescript/no-invalid-void-type -- void is the natural type for a callback that returns nothing
export type SetupReturn = Module | Cleanup | void;

export interface Feature {
  readonly components?: readonly RiftType[];
  readonly events?: readonly RiftType[];
  readonly server?: (server: RiftServer) => SetupReturn | Promise<SetupReturn>;
  readonly client?: (
    client: RiftClient,
    reactive: ReactiveWorld,
  ) => SetupReturn | Promise<SetupReturn>;
}

export function defineFeature(f: Feature): Feature {
  return f;
}

export function normalizeCleanup(r: SetupReturn): Cleanup | undefined {
  if (!r) return undefined;
  return typeof r === "function" ? r : (): void | Promise<void> => r.stop();
}

export interface CreateServerOptions {
  readonly transport: ServerTransport;
  readonly hash: HashFn;
  readonly tickRateHz?: number;
  readonly handshakeTimeoutMs?: number;
  readonly visibility?: VisibilityFn;
  readonly features: readonly Feature[];
}

export interface ServerSession {
  readonly server: RiftServer;
  start(): Promise<void>;
  stop(code?: number, reason?: string): Promise<void>;
}

export function createServer(opts: CreateServerOptions): ServerSession {
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
  return {
    server,
    async start() {
      // Feature setups run before server.start() so subscribers register
      // before the transport begins delivering messages and before the
      // first tick fires.
      for (const f of opts.features) {
        if (!f.server) continue;
        // oxlint-disable-next-line no-await-in-loop -- registration-order init is intentional
        const c = normalizeCleanup(await f.server(server));
        if (c) cleanups.push(c);
      }
      await server.start();
    },
    async stop(code, reason) {
      for (const c of cleanups.reverse()) {
        // oxlint-disable-next-line no-await-in-loop -- reverse-order teardown
        await c();
      }
      cleanups.length = 0;
      await server.stop(code, reason);
    },
  };
}

export interface CreateClientOptions {
  readonly transport: ClientTransport;
  readonly hash: HashFn;
  readonly features: readonly Feature[];
  readonly attachReactive: (world: World) => ReactiveWorld;
}

export interface ClientSession {
  readonly client: RiftClient;
  readonly reactive: ReactiveWorld;
  connect(): Promise<void>;
  disconnect(code?: number, reason?: string): Promise<void>;
}

export function createClient(opts: CreateClientOptions): ClientSession {
  const components = opts.features.flatMap((f) => f.components ?? []);
  const events = opts.features.flatMap((f) => f.events ?? []);
  const schema = defineSchema({ components, events, hash: opts.hash });
  const client = new RiftClient({ schema, transport: opts.transport });
  const reactive = opts.attachReactive(client.world);
  const cleanups: Cleanup[] = [];
  return {
    client,
    reactive,
    async connect() {
      await client.connect();
      // Feature setups run after handshake completes so the client world
      // is already populated when subscribers register.
      for (const f of opts.features) {
        if (!f.client) continue;
        // oxlint-disable-next-line no-await-in-loop -- registration-order init is intentional
        const c = normalizeCleanup(await f.client(client, reactive));
        if (c) cleanups.push(c);
      }
    },
    async disconnect(code, reason) {
      for (const c of cleanups.reverse()) {
        // oxlint-disable-next-line no-await-in-loop -- reverse-order teardown
        await c();
      }
      cleanups.length = 0;
      await client.disconnect(code, reason);
    },
  };
}
