// oxlint-disable eslint-plugin-react-hooks/exhaustive-deps
import { useEffect, useMemo, useRef } from "preact/hooks";

export { useSignalEffect, useSignal, useComputed } from "@preact/signals";

export type MountCleanup = () => void;
export type MountSetup = () => MountCleanup | undefined;

export function useMount(setup: MountSetup): void {
  const setupRef = useRef(setup);
  setupRef.current = setup;
  useEffect(() => setupRef.current(), []);
}

export interface Disposable {
  dispose(): unknown;
}

export function useDisposable<
  const TArgs extends readonly unknown[],
  T extends Disposable,
>(factory: (...args: TArgs) => T, deps: TArgs): T {
  const instance = useMemo(() => factory(...deps), deps);
  useEffect(() => () => void instance.dispose(), [instance]);
  return instance;
}
