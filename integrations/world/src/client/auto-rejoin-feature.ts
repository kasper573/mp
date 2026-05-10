import type { Feature } from "@rift/feature";
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

export function autoRejoinFeature(opts: AutoRejoinOptions): Feature {
  return {
    client(client) {
      let wasOpen = false;
      return effect(() => {
        const isOpen = client.state.value === "open";
        if (isOpen && !wasOpen) {
          const intent = opts.intent();
          if (intent) {
            if (intent.mode === "player") {
              joinAsPlayer(client, intent.characterId);
            } else {
              joinAsSpectator(client, intent.characterId);
            }
          }
        }
        wasOpen = isOpen;
      });
    },
  };
}
