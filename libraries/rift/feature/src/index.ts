import type { ClientOptions, ServerOptions, World } from "@rift/core";
import { defineSchema, type HashFn, RiftClient, RiftServer } from "@rift/core";
import type { ReactiveWorld } from "@rift/reactive";
import type { RiftType } from "@rift/types";

type MaybePromise<T> = T | Promise<T>;
export type Cleanup = () => MaybePromise<void>;

export type FeatureSetupFn<Context> = (
  context: Context,
  // oxlint-disable-next-line typescript/no-invalid-void-type
) => MaybePromise<Cleanup | void | undefined>;

export interface Feature {
  readonly components?: readonly RiftType[];
  readonly events?: readonly RiftType[];
  readonly server?: FeatureSetupFn<FeatureRiftServer>;
  readonly client?: FeatureSetupFn<FeatureRiftClient>;
}

export function defineFeature(f: Feature): Feature {
  return f;
}

export type FeatureServerOptions = Omit<ServerOptions, "schema"> & {
  readonly features: readonly Feature[];
  readonly hash: HashFn;
};

export class FeatureRiftServer extends RiftServer {
  constructor(private opts: FeatureServerOptions) {
    super({
      ...opts,
      schema: defineSchema({
        components: opts.features.flatMap((f) => f.components ?? []),
        events: opts.features.flatMap((f) => f.events ?? []),
        hash: opts.hash,
      }),
    });
  }

  #cleanup?: Cleanup;
  override async start(): Promise<void> {
    this.#cleanup = await setup(
      this,
      this.opts.features.map((f) => f.server),
    );
    await super.start();
  }

  override async stop(...args: Parameters<RiftServer["stop"]>): Promise<void> {
    await this.#cleanup?.();
    await super.stop(...args);
    this.#cleanup = undefined;
  }
}

export type FeatureClientOptions = Omit<ClientOptions, "schema"> & {
  readonly features: readonly Feature[];
  readonly hash: HashFn;
  readonly attachReactive: (world: World) => ReactiveWorld;
};

export class FeatureRiftClient extends RiftClient {
  readonly reactive: ReactiveWorld;

  constructor(private opts: FeatureClientOptions) {
    super({
      ...opts,
      schema: defineSchema({
        components: opts.features.flatMap((f) => f.components ?? []),
        events: opts.features.flatMap((f) => f.events ?? []),
        hash: opts.hash,
      }),
    });
    this.reactive = opts.attachReactive(this.world);
  }

  #cleanup?: Cleanup;

  override async connect(): Promise<void> {
    // super.connect() resolves only once the handshake snapshot has been
    // ingested into the world. Running feature setups afterwards lets
    // each feature query a fully-populated world; running them before
    // would expose features to a partial world during snapshot ingest.
    await super.connect();

    this.#cleanup = await setup(
      this,
      this.opts.features.map((f) => f.client),
    );
  }

  override async disconnect(
    ...args: Parameters<RiftClient["disconnect"]>
  ): Promise<void> {
    await this.#cleanup?.();
    await super.disconnect(...args);
    this.#cleanup = undefined;
  }
}

async function setup<Context>(
  context: Context,
  setupFns: ReadonlyArray<FeatureSetupFn<Context> | undefined>,
): Promise<Cleanup> {
  const cleanups: Cleanup[] = [];
  for (const setup of setupFns) {
    // oxlint-disable-next-line no-await-in-loop
    const cleanup = await setup?.(context);
    if (cleanup) {
      cleanups.push(cleanup);
    }
  }
  cleanups.reverse();
  return async () => {
    for (const c of cleanups) {
      // oxlint-disable-next-line no-await-in-loop
      await c();
    }
  };
}
