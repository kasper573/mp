import { useEffect, useRef } from "preact/hooks";

export { useSignalEffect, useSignal, useComputed } from "@preact/signals";

export type MountCleanup = () => void;
export type MountSetup = () => MountCleanup | undefined;

export function useMount(setup: MountSetup): void {
  const setupRef = useRef(setup);
  setupRef.current = setup;
  useEffect(() => setupRef.current(), []);
}
