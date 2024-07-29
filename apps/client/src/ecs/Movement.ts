import { Cleanup, subscribe } from "@mp/events";
import type { Entity, PostUpdateEvent } from "@mp/excalibur";
import type { Vector } from "@mp/excalibur";
import { Component } from "@mp/excalibur";
import { moveAlongPath } from "@mp/state";

export class Movement extends Component {
  private cleanup = new Cleanup();
  private moveAlong?: MoveAlongParams;
  private hasAssignedPositionAtLeastOnce = false;

  constructor(private getPos: (owner: Entity) => Vector) {
    super();
  }

  sync(currentPosition: Vector, moveAlong?: MoveAlongParams): void {
    this.moveAlong = moveAlong;
    if (!moveAlong || !this.hasAssignedPositionAtLeastOnce) {
      const pos = this.getPos(this.owner!);
      pos.x = currentPosition.x;
      pos.y = currentPosition.y;
      this.hasAssignedPositionAtLeastOnce = true;
    }
  }

  override onAdd(): void {
    this.cleanup.add(subscribe(this.owner!, "postupdate", this.onEntityUpdate));
  }

  override onRemove(): void {
    this.cleanup.flush();
  }

  private onEntityUpdate = (e: PostUpdateEvent) => {
    if (!this.owner || !this.moveAlong) {
      return;
    }

    moveAlongPath(
      this.getPos(this.owner),
      this.moveAlong.path,
      this.moveAlong.speed * (e.delta / 1000),
    );

    if (this.moveAlong.path.length === 0) {
      this.moveAlong = undefined;
    }
  };
}

type MoveAlongParams = { path: Vector[]; speed: number };
