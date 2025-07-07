import { type TimesPerSecond } from "@mp/std";
import { TimeSpan } from "@mp/time";
import { type ActorAnimationName } from "../../server";
import type { Animation } from "../pixi/animation-controller";
import { AnimationController } from "../pixi/animation-controller";

export class ActorSprite extends AnimationController<ActorAnimationName> {
  attackSpeed = 1 as TimesPerSecond;

  constructor(initialAnimation?: Animation<ActorAnimationName>) {
    super({
      width: 48,
      height: 64,
      initialAnimation,
      anchor: { x: 0.5, y: 2 / 3 }, // 2/3 seems to be a consistent anchor point specifically for the adventurer sprite pack
      frameTime: () =>
        isAttackAnimation(this.currentAnimationName)
          ? TimeSpan.fromMilliseconds(100).divide(this.attackSpeed)
          : TimeSpan.fromMilliseconds(100),
    });
  }
}

function isAttackAnimation(name?: ActorAnimationName): boolean {
  return name === "attack-shooting" || name === "attack-spear";
}
