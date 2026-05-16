import { createContext } from "preact";
import { useContext } from "preact/compat";
import {
  type ClientState,
  ClientStateChanged,
  defineSchema,
  RiftClient,
} from "@rift/core";
import { ReactiveWorld } from "@rift/reactive";
import { wsTransport } from "@rift/ws";
import { WebSocket as PartySocket } from "partysocket";
import { signal, type ReadonlySignal } from "@preact/signals-core";
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
  readonly #stateSignal = signal<ClientState>("idle");
  #cleanup?: Cleanup;

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

    this.on(ClientStateChanged, (event) => {
      this.#stateSignal.value = event.data.state;
    });

    this.#cleanup = setupFeatures(
      this,
      features.map((f) => f.client),
    );
  }

  get state$(): ReadonlySignal<ClientState> {
    return this.#stateSignal;
  }

  override dispose(...args: Parameters<RiftClient["dispose"]>): void {
    void this.#cleanup?.();
    this.#cleanup = undefined;
    super.dispose(...args);
  }
}

export function awaitOpen(
  client: MpRiftClient,
  timeoutMs = 15_000,
): Promise<void> {
  if (client.state === "open") {
    return Promise.resolve();
  }
  if (client.state === "closed") {
    return Promise.reject(
      new Error(client.closeReason ?? "client closed before reaching open"),
    );
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error("client did not reach open before timeout"));
    }, timeoutMs);
    const off = client.on(ClientStateChanged, (event) => {
      if (event.data.state === "open") {
        clearTimeout(timer);
        off();
        resolve();
      } else if (event.data.state === "closed") {
        clearTimeout(timer);
        off();
        reject(
          new Error(client.closeReason ?? "client closed before reaching open"),
        );
      }
    });
  });
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
