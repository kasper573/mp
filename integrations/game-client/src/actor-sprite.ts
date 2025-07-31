import type { ActorModelState } from "@mp/game-shared";
import type { Animation } from "@mp/graphics";
import { AnimationController } from "@mp/graphics";
import type { TimesPerSecond } from "@mp/std";
import { TimeSpan } from "@mp/time";

export class ActorSprite extends AnimationController<ActorModelState> {
  attackSpeed = 1 as TimesPerSecond;

  constructor(initialAnimation?: Animation<ActorModelState>) {
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

function isAttackAnimation(name?: ActorModelState): boolean {
  return name === "attack-shooting" || name === "attack-spear";
}
