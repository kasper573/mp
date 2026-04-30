import type { Cleanup } from "./types";

export abstract class RiftModule {
  // oxlint-disable-next-line typescript/no-invalid-void-type
  abstract init(): void | Cleanup | Promise<void | Cleanup>;
}
