import type { RiftType } from "@rift/types";
import type { MpRiftClient } from "./client";
import type { MpRiftServer } from "./server";

type MaybePromise<T> = T | Promise<T>;
export type Cleanup = () => MaybePromise<void>;

export type FeatureSetupFn<Context> = (
  context: Context,
  // oxlint-disable-next-line typescript/no-invalid-void-type
) => Cleanup | void | undefined;

export interface Feature {
  readonly components?: readonly RiftType[];
  readonly events?: readonly RiftType[];
  readonly server?: FeatureSetupFn<MpRiftServer>;
  readonly client?: FeatureSetupFn<MpRiftClient>;
}

export function setupFeatures<Context>(
  context: Context,
  setupFns: ReadonlyArray<FeatureSetupFn<Context> | undefined>,
): Cleanup {
  const cleanups: Cleanup[] = [];
  for (const setup of setupFns) {
    const cleanup = setup?.(context);
    if (cleanup) {
      cleanups.push(cleanup);
    }
  }
  cleanups.reverse();
  return async () => {
    for (const c of cleanups) {
      // oxlint-disable-next-line no-await-in-loop
      await c();
    }
  };
}
