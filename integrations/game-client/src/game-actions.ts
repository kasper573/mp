import type { EntityId, RiftClient } from "@rift/core";
import { AttackRequest, MoveRequest, Recall, Respawn } from "@mp/world";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";

export class GameActions {
  readonly #client: RiftClient;
  constructor(client: RiftClient) {
    this.#client = client;
  }

  move(to: Vector<Tile>): void {
    this.#client.emit({
      type: MoveRequest,
      data: { target: { x: to.x, y: to.y } },
      source: "local",
      target: "wire",
    });
  }

  attack(targetId: EntityId): void {
    this.#client.emit({
      type: AttackRequest,
      data: { targetId },
      source: "local",
      target: "wire",
    });
  }

  respawn(): void {
    this.#client.emit({
      type: Respawn,
      data: {},
      source: "local",
      target: "wire",
    });
  }

  recall(): void {
    this.#client.emit({
      type: Recall,
      data: {},
      source: "local",
      target: "wire",
    });
  }
}
