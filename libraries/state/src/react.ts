import { useEffect, useRef } from "preact/hooks";

export { useSignalEffect, useSignal, useComputed } from "@preact/signals";

export type MountCleanup = () => void;
export type MountSetup = () => MountCleanup | undefined;

/**
 * Runs `setup` once when the component mounts. The function may return a
 * cleanup callback that runs on unmount. Exists so application code in
 * `apps/` and `integrations/` can express a one-time mount lifecycle
 * without reaching for a raw `useEffect` (which is reserved for custom
 * hook implementations per the project's authoring conventions).
 */
export function useMount(setup: MountSetup): void {
  const setupRef = useRef(setup);
  setupRef.current = setup;
  useEffect(() => setupRef.current(), []);
}
