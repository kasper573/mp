import type { RiftType } from "@rift/types";
import { Writer } from "@rift/types";

export type HashFn = (input: Uint8Array) => Uint8Array;

export interface RiftSchemaOptions {
  readonly components: readonly RiftType[];
  readonly events: readonly RiftType[];
  readonly hash: HashFn;
}

export interface RiftSchema {
  readonly components: readonly RiftType[];
  readonly events: readonly RiftType[];
  componentIndexOf(ty: RiftType): number | undefined;
  eventIndexOf(ty: RiftType): number | undefined;
  digest(): Uint8Array;
}

export function defineSchema(opts: RiftSchemaOptions): RiftSchema {
  const componentIndex = buildIndex(opts.components);
  const eventIndex = buildIndex(opts.events);
  let cachedDigest: Uint8Array | undefined;

  const componentDuplicates = duplicates(opts.components);
  if (componentDuplicates.length > 0) {
    throw new Error(
      `Duplicate component types found in schema at positions: ${componentDuplicates.map((ty) => opts.components.indexOf(ty)).join(", ")}`,
    );
  }

  const eventDuplicates = duplicates(opts.events);
  if (eventDuplicates.length > 0) {
    throw new Error(
      `Duplicate event types found in schema at positions: ${eventDuplicates.map((ty) => opts.events.indexOf(ty)).join(", ")}`,
    );
  }

  return {
    components: opts.components,
    events: opts.events,

    componentIndexOf(ty: RiftType): number | undefined {
      return componentIndex.get(ty);
    },

    eventIndexOf(ty: RiftType): number | undefined {
      return eventIndex.get(ty);
    },

    digest(): Uint8Array {
      if (cachedDigest) {
        return cachedDigest;
      }
      const w = new Writer(256);
      w.writeU16(this.components.length);
      for (const ty of this.components) {
        w.writeBytes(ty.inspect());
      }
      w.writeU16(this.events.length);
      for (const ty of this.events) {
        w.writeBytes(ty.inspect());
      }
      cachedDigest = opts.hash(w.finish());
      return cachedDigest;
    },
  };
}

function buildIndex(list: readonly RiftType[]): Map<RiftType, number> {
  const map = new Map<RiftType, number>();
  for (let i = 0; i < list.length; i++) {
    map.set(list[i], i);
  }
  return map;
}

function duplicates(list: readonly RiftType[]): RiftType[] {
  const seen = new Set<RiftType>();
  const dups: RiftType[] = [];
  for (const ty of list) {
    if (seen.has(ty)) {
      dups.push(ty);
    } else {
      seen.add(ty);
    }
  }
  return dups;
}
