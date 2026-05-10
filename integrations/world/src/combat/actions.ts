import type { EntityId, RiftClient } from "@rift/core";
import { AttackRequest } from "./events";

export function attackTarget(client: RiftClient, targetId: EntityId): void {
  client.emit({
    type: AttackRequest,
    data: targetId,
    source: "local",
    target: "wire",
  });
}
