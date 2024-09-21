import type { ReadonlySignal } from "@mp/state";
import { signal } from "@mp/state";

export function createHeldKeysInterface<KeyName extends string>() {
  const heldKeys = signal(new Set<KeyName>());
  const onDown = (e: KeyboardEvent) => heldKeys.value.add(e.key as KeyName);
  const onUp = (e: KeyboardEvent) => heldKeys.value.delete(e.key as KeyName);
  return {
    signal: heldKeys as ReadonlySignal<ReadonlySet<KeyName>>,
    start() {
      window.addEventListener("keydown", onDown);
      window.addEventListener("keyup", onUp);
    },
    stop() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    },
  };
}
