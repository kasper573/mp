import type { RiftClient } from "@rift/core";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { MoveRequest } from "./events";

export function moveCharacter(client: RiftClient, to: Vector<Tile>): void {
  client.emit({
    type: MoveRequest,
    data: to,
    source: "local",
    target: "wire",
  });
}
