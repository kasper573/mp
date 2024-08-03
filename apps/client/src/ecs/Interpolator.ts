import { Cleanup, sub } from "@mp/excalibur";
import type { Vector, Entity, PostUpdateEvent } from "@mp/excalibur";
import { Component } from "@mp/excalibur";
import { moveAlongPath } from "@mp/state";

export class Interpolator extends Component {
  private cleanup = new Cleanup();
  private pathInterpolation?: PathIntepolation;
  private needsInitialPoisition = true;

  constructor(private getPos: (owner: Entity) => Vector) {
    super();
  }

  configure(
    staticPosition: Vector,
    pathInterpolation?: PathIntepolation,
  ): void {
    this.pathInterpolation = pathInterpolation;
    if (!pathInterpolation || this.needsInitialPoisition) {
      const pos = this.getPos(this.owner!);
      pos.x = staticPosition.x;
      pos.y = staticPosition.y;
      this.needsInitialPoisition = false;
    }
  }

  override onAdd(): void {
    this.cleanup.add(sub(this.owner!, "postupdate", this.onEntityUpdate));
  }

  override onRemove(): void {
    this.cleanup.flush();
  }

  private onEntityUpdate = (e: PostUpdateEvent) => {
    if (!this.owner || !this.pathInterpolation) {
      return;
    }

    moveAlongPath(
      this.getPos(this.owner),
      this.pathInterpolation.path,
      this.pathInterpolation.speed * (e.delta / 1000),
    );

    if (this.pathInterpolation.path.length === 0) {
      this.pathInterpolation = undefined;
    }
  };
}

type PathIntepolation = { path: Vector[]; speed: number };
