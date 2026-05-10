import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ReadonlySignal } from "@preact/signals-core";
import type { WorldSignals, ReactiveWorld } from "./index";

export const RiftContext = createContext(
  new Proxy({} as ReactiveWorld, {
    get() {
      throw new Error("RiftContext not provided");
    },
  }),
);

/**
 * Subscribe a Preact component to the reactive world.
 *
 * The selector receives the world's signal namespace and returns any
 * `ReadonlySignal`. The hook reads `.value`, so the component re-renders
 * when the signal updates.
 *
 *   const movement = useRift((s) => s.get(id, Movement));
 *   const ids = useRift((s) => s.entities(Movement, AreaTag));
 */
export function useRift<T>(
  selector: (signals: WorldSignals) => ReadonlySignal<T>,
): T {
  const world = useContext(RiftContext);
  return selector(world.signal).value;
}
