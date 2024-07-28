import { Cleanup, subscribe } from "@mp/events";
import type { Entity, PostUpdateEvent } from "@mp/excalibur";
import { Vector } from "@mp/excalibur";
import { Component } from "@mp/excalibur";
import { moveAlongPath } from "@mp/state";

export class Movement extends Component {
  private cleanup = new Cleanup();

  private moveAlong?: MoveAlongParams;

  constructor(private getPos: (owner: Entity) => Vector) {
    super();
  }

  update(target: MovementTarget) {
    if (target instanceof Vector) {
      const pos = this.getPos(this.owner!);
      pos.x = target.x;
      pos.y = target.y;
    } else {
      this.moveAlong = target;
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

    const pos = this.getPos(this.owner);
    moveAlongPath(
      pos,
      this.moveAlong.path,
      this.moveAlong.speed * (e.delta / 1000),
    );
  };
}

type MoveAlongParams = { path: Vector[]; speed: number };

type MovementTarget = MoveAlongParams | Vector;
