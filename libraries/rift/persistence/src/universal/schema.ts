import type { RiftType } from "@rift/core";

export type CollectionMode = "world" | "session";

export interface CollectionConfig<TKeyComp extends RiftType<string>> {
  keyComponent: TKeyComp;
  components: ReadonlyArray<RiftType>;
  queryComponents?: ReadonlyArray<RiftType>;
  mode?: CollectionMode;
  leaseDurationMs?: number;
}

export interface PersistenceSchema {
  instanceId: string;
  dbPath: string;
  collections: Record<string, CollectionConfig<RiftType<string>>>;
  saveInterval?: number;
  pollInterval?: number;
}
