import { createContext } from "preact";
import type { Signal } from "@mp/state";
import type { EntityId, RiftClient } from "@rift/core";

export interface PreactRendererContextValue {
  rift: RiftClient;
  localCharacterEntityId: Signal<EntityId | undefined>;
  respawn: Signal<(() => void) | undefined>;
}

export const PreactRendererContext = createContext<
  PreactRendererContextValue | undefined
>(undefined);
