import { createContext } from "preact";
import { useContext } from "preact/compat";
import { defineSchema, RiftClient } from "@rift/core";
import type { EntityId } from "@rift/core";
import { ReactiveWorld } from "@rift/reactive";
import { wsTransport } from "@rift/ws";
import {
  effect,
  signal,
  type ReadonlySignal,
  type Signal,
} from "@preact/signals-core";
import { WebSocket } from "partysocket";
import type { AccessToken } from "@mp/auth";
import { joinAsPlayer, joinAsSpectator } from "./character/actions";
import {
  CharacterList,
  characterListFeature,
} from "./character/character-list-feature";
import { characterEntitySignal } from "./character/signals";
import { fnv1a64 } from "./hash";
import type { CharacterId } from "./identity/ids";
import { schemaComponents, schemaEvents } from "./schema";
import type { Cleanup, Feature } from "./feature";
import { setupFeatures } from "./feature";

export interface MpRiftClientOptions {
  readonly url: string;
  readonly accessToken: AccessToken | undefined;
  readonly mode: "player" | "spectator";
}

export class MpRiftClient extends RiftClient<ReactiveWorld> {
  readonly characters: CharacterList;
  readonly selectedCharacterId: Signal<CharacterId | undefined>;
  readonly selectedCharacterEntity: ReadonlySignal<EntityId | undefined>;

  readonly #features: readonly Feature[];
  readonly #mode: "player" | "spectator";
  readonly #disposeAutoJoin: () => void;

  constructor(opts: MpRiftClientOptions) {
    const characters = new CharacterList();
    const selectedCharacterId = signal<CharacterId | undefined>(undefined);

    const features: Feature[] = [
      { components: schemaComponents, events: schemaEvents },
      characterListFeature(characters),
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
      wsTransport(new WebSocket(url.toString())),
    );

    this.#features = features;
    this.#mode = opts.mode;
    this.characters = characters;
    this.selectedCharacterId = selectedCharacterId;
    this.selectedCharacterEntity = characterEntitySignal(
      this.world,
      selectedCharacterId,
    );

    this.#disposeAutoJoin = effect(() => {
      if (this.state.value !== "open") return;
      const id = this.selectedCharacterId.value;
      if (!id) return;
      if (this.#mode === "player") joinAsPlayer(this, id);
      else joinAsSpectator(this, id);
    });
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
    this.#disposeAutoJoin();
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
