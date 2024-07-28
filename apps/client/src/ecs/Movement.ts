import { Cleanup, subscribe } from "@mp/events";
import type { Entity, PostUpdateEvent, Vector } from "@mp/excalibur";
import { Component } from "@mp/excalibur";

export class Movement extends Component {
  private cleanup = new Cleanup();

  public lerpTo?: Vector;

  constructor(private getPos: (owner: Entity) => Vector) {
    super();
  }

  updatePosition(pos: Vector) {
    this.lerpTo = pos;
  }

  override onAdd(): void {
    this.cleanup.add(subscribe(this.owner!, "postupdate", this.update));
  }

  override onRemove(): void {
    this.cleanup.flush();
  }

  private update = (e: PostUpdateEvent) => {
    if (this.lerpTo && this.owner) {
      const pos = this.getPos(this.owner);
      pos.x = lerp(pos.x, this.lerpTo.x, 0.2);
      pos.y = lerp(pos.y, this.lerpTo.y, 0.2);
      if (pos.distance(this.lerpTo) < lerpMinDistance) {
        pos.x = this.lerpTo.x;
        pos.y = this.lerpTo.y;
        this.lerpTo = undefined;
      }
    }
  };
}

const lerpMinDistance = 1;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
