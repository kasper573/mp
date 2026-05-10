import type { ServerOptions } from "@rift/core";
import { defineSchema, type HashFn, RiftServer } from "@rift/core";
import type { Cleanup, Feature } from "./feature";
import { setupFeatures } from "./feature";

type FeatureServerOptions = Omit<ServerOptions, "schema"> & {
  readonly features: readonly Feature[];
  readonly hash: HashFn;
};

export class MpRiftServer extends RiftServer {
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
    this.#cleanup = await setupFeatures(
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
