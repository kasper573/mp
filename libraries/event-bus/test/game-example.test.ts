import { describe, expect, it } from "vitest";
import { event, EventBus } from "../src";
import type { TimesPerSecond } from "@mp/std";
import type { TickEvent } from "@mp/time";
import { TimeSpan } from "@mp/time";
import { EventTracker } from "../src/tracker";

describe("game-example", () => {
  it("a single long enough tick produces enough attacks to kill target", () => {
    const game = createGame();
    const player = createActor(1);
    const enemy = createActor(2);
    game.state.actors.set(player.id, player);
    game.state.actors.set(enemy.id, enemy);
    game.emit(target({ attacker: player.id, target: enemy.id }));

    const obs = new EventTracker();
    obs.track(game);

    const testDuration = TimeSpan.fromSeconds(10);
    const timeSinceLastTick = TimeSpan.fromMilliseconds(50);
    let totalTimeElapsed = TimeSpan.fromSeconds(0);
    while (totalTimeElapsed.compareTo(testDuration) <= 0) {
      game.emit(tick({ timeSinceLastTick, totalTimeElapsed }));
      totalTimeElapsed = totalTimeElapsed.add(timeSinceLastTick);
    }

    expect(obs.seen(died)).toEqual([{ killer: player.id, victim: enemy.id }]);
    expect(obs.seen(attack).length).toBe(10);
    expect(enemy.health).toBe(0);
  });
});

function createGame() {
  const game = new EventBus<GameState>({
    actors: new Map<ActorId, Actor>(),
  });

  game.on(target, (event, state) => {
    const attacker = state.actors.get(event.payload.attacker);
    if (attacker) {
      attacker.target = event.payload.target;
    }
  });

  game.on(attack, (event, state) => {
    const attacker = state.actors.get(event.payload.attacker);
    const target = state.actors.get(event.payload.target);
    if (target && attacker && target.health > 0) {
      target.health -= attacker.damage;
      if (target.health <= 0) {
        target.health = 0;
        game.emit(
          died({
            killer: event.payload.attacker,
            victim: event.payload.target,
          }),
        );
        attacker.target = undefined;
      }
    }
  });

  game.on(tick, (event, state) => {
    for (const [id, actor] of state.actors) {
      if (actor.target === undefined) {
        continue;
      }

      if (
        actor.attackCooldown &&
        event.payload.totalTimeElapsed.isBefore(actor.attackCooldown)
      ) {
        continue;
      }

      actor.attackCooldown = event.payload.totalTimeElapsed.add(
        TimeSpan.fromSeconds(1 / actor.attackSpeed),
      );
      game.emit(attack({ attacker: id, target: actor.target }));
    }
  });

  return game;
}

function createActor(id: ActorId): Actor {
  return {
    id,
    health: 100,
    damage: 10,
    attackSpeed: 1 as TimesPerSecond,
  };
}

const target = event("target")
  .payload<{ attacker: ActorId; target: ActorId }>()
  .build();

const attack = event("attack")
  .payload<{ attacker: ActorId; target: ActorId }>()
  .build();

const died = event("died")
  .payload<{ killer: ActorId; victim: ActorId }>()
  .build();

const tick = event("tick").payload<TickEvent>().build();

type ActorId = number;

interface Actor {
  id: ActorId;
  health: number;
  damage: number;
  attackSpeed: TimesPerSecond;
  attackCooldown?: TimeSpan;
  target?: ActorId;
}

interface GameState {
  actors: Map<ActorId, Actor>;
}
