import { type TimesPerSecond } from "@mp/std";
import { TimeSpan } from "@mp/time";
import { type ActorAnimationName } from "../../server";
import { AnimationController } from "./animation-controller";

export class ActorSprite extends AnimationController<ActorAnimationName> {
  attackSpeed = 1 as TimesPerSecond;

  constructor(initialAnimationName?: ActorAnimationName) {
    super({
      width: 48,
      height: 64,
      anchor: { x: 0.5, y: 2 / 3 }, // 2/3 seems to be a consistent anchor point specifically for the adventurer sprite pack
      frameTime: () =>
        isAttackAnimation(this.currentAnimationName)
          ? TimeSpan.fromMilliseconds(100).divide(this.attackSpeed)
          : TimeSpan.fromMilliseconds(100),
    });
    if (initialAnimationName) {
      this.fixed = {
        name: initialAnimationName,
        type: "fixed-at-end",
      };
    }
  }
}

function isAttackAnimation(name?: ActorAnimationName): boolean {
  return name === "attack-shooting" || name === "attack-spear";
}
