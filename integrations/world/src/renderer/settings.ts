import { StorageSignal } from "@mp/state";

export const interpolationEnabled = new StorageSignal(
  "local",
  "world-interpolation-enabled",
  true,
);
