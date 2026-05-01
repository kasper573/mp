import { RiftClientModule } from "@rift/core";
import type { Cleanup } from "@rift/module";
import { effect } from "@preact/signals-core";
import type { CharacterId } from "../identity/ids";
import { joinAsPlayer, joinAsSpectator } from "./actions";

export interface AutoRejoinIntent {
  readonly mode: "player" | "spectator";
  readonly characterId: CharacterId;
}

export interface AutoRejoinOptions {
  readonly intent: () => AutoRejoinIntent | undefined;
}

export class AutoRejoinModule extends RiftClientModule {
  readonly #opts: AutoRejoinOptions;
  #wasOpen = false;

  constructor(opts: AutoRejoinOptions) {
    super();
    this.#opts = opts;
  }

  init(): Cleanup {
    return effect(() => {
      const isOpen = this.client.state.value === "open";
      if (isOpen && !this.#wasOpen) {
        const intent = this.#opts.intent();
        if (intent) {
          if (intent.mode === "player") {
            joinAsPlayer(this.client, intent.characterId);
          } else {
            joinAsSpectator(this.client, intent.characterId);
          }
        }
      }
      this.#wasOpen = isOpen;
    });
  }
}
