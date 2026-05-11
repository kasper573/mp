import { createContext } from "preact";
import { useContext } from "preact/compat";
import { defineSchema, RiftClient } from "@rift/core";
import { ReactiveWorld } from "@rift/reactive";
import { wsTransport } from "@rift/ws";
import { WebSocket as PartySocket } from "partysocket";
import type { ReadonlySignal } from "@preact/signals-core";
import type { AccessToken } from "@mp/auth";
import { fnv1a64 } from "./hash";
import { schemaComponents, schemaEvents } from "./schema";
import type { Cleanup, Feature } from "./feature";
import { setupFeatures } from "./feature";

export interface MpRiftClientOptions {
  readonly url: string;
  readonly accessToken: AccessToken | undefined;
}

export class MpRiftClient extends RiftClient<ReactiveWorld> {
  readonly #features: readonly Feature[];

  constructor(opts: MpRiftClientOptions) {
    const features: Feature[] = [
      { components: schemaComponents, events: schemaEvents },
    ];

    const url = new URL(opts.url);
    url.searchParams.set(wsHandshakeAccessTokenParam, opts.accessToken ?? "");

    const schema = defineSchema({
      components: features.flatMap((f) => f.components ?? []),
      events: features.flatMap((f) => f.events ?? []),
      hash: fnv1a64,
    });
    super(
      new ReactiveWorld(schema),
      wsTransport(new PartySocket(url.toString())),
    );

    this.#features = features;
  }

  #cleanup?: Cleanup;

  override async connect(): Promise<void> {
    // super.connect() resolves only once the handshake snapshot has been
    // ingested into the world. Running feature setups afterwards lets
    // each feature query a fully-populated world; running them before
    // would expose features to a partial world during snapshot ingest.
    await super.connect();
    this.#cleanup = await setupFeatures(
      this,
      this.#features.map((f) => f.client),
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

export const RiftContext = createContext(
  new Proxy({} as MpRiftClient, {
    get() {
      throw new Error("RiftContext has not been provided");
    },
  }),
);

export function useRift<T>(
  selector: (client: MpRiftClient) => ReadonlySignal<T>,
): T {
  return selector(useContext(RiftContext)).value;
}

export const wsHandshakeAccessTokenParam = "accessToken";
