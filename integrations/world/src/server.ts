import type { ServerOptions } from "@rift/core";
import { defineSchema, type HashFn, RiftServer } from "@rift/core";
import type { Cleanup, Feature } from "./feature";
import { setupFeatures } from "./feature";

type FeatureServerOptions = Omit<ServerOptions, "schema"> & {
  readonly features: readonly Feature[];
  readonly hash: HashFn;
};

export class MpRiftServer extends RiftServer {
  #cleanup?: Cleanup;

  constructor(opts: FeatureServerOptions) {
    super({
      ...opts,
      schema: defineSchema({
        components: opts.features.flatMap((f) => f.components ?? []),
        events: opts.features.flatMap((f) => f.events ?? []),
        hash: opts.hash,
      }),
    });
    this.#cleanup = setupFeatures(
      this,
      opts.features.map((f) => f.server),
    );
  }

  override async dispose(): Promise<void> {
    await this.#cleanup?.();
    this.#cleanup = undefined;
    await super.dispose();
  }
}
