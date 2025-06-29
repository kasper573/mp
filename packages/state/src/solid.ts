import { atom } from "nanostores";
import { createEffect } from "solid-js";
import type { ReadonlyAtom } from "./atom";

export { useStore as useAtom } from "@nanostores/solid";

/**
 * This is an anti-pattern that should only be used while we're transitioning away from solid-js signals.
 * @deprecated
 */
export function useSignalAsAtom<T>(signal: () => T): ReadonlyAtom<T> {
  const signalAsAtom = atom(signal());
  createEffect(() => signalAsAtom.set(signal()));
  return signalAsAtom;
}
