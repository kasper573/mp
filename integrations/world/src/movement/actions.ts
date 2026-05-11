import type { RiftClient } from "@rift/core";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import { MoveRequest, MoveToPortal } from "./events";

export function moveCharacter(client: RiftClient, to: Vector<Tile>): void {
  client.emit({
    type: MoveRequest,
    data: to,
    source: "local",
    target: "wire",
  });
}

export function moveCharacterToPortal(
  client: RiftClient,
  portalId: ObjectId,
  to: Vector<Tile>,
): void {
  client.emit({
    type: MoveToPortal,
    data: { portalId, movement: to },
    source: "local",
    target: "wire",
  });
}
