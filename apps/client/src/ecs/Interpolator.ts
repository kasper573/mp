import { Cleanup, sub } from "@mp/pixi";
import type { Entity, PostUpdateEvent } from "@mp/pixi";
import type { Vector } from "@mp/math";
import { moveAlongPath, TimeSpan } from "@mp/state";
import { Component } from "@mp/pixi";

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

    const { destinationReached } = moveAlongPath(
      this.getPos(this.owner),
      this.pathInterpolation.path,
      this.pathInterpolation.speed,
      TimeSpan.fromMilliseconds(e.delta),
    );

    if (destinationReached) {
      this.pathInterpolation = undefined;
    }
  };
}

type PathIntepolation = { path: Vector[]; speed: number };
