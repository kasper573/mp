import { createContext } from "preact";
import type { ReadonlySignal, Signal } from "@mp/state";
import type { EntityId, RiftClient } from "@rift/core";

export interface ChatLine {
  fromEntityId: number;
  text: string;
}

export interface PreactRendererContextValue {
  rift: RiftClient;
  localCharacterEntityId: Signal<EntityId | undefined>;
  respawn: Signal<(() => void) | undefined>;
  chatLines: ReadonlySignal<ChatLine[]>;
}

export const PreactRendererContext = createContext<
  PreactRendererContextValue | undefined
>(undefined);
