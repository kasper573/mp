import type { Tile } from "@mp/std";
import { assert } from "@mp/std";
import type { ActorId } from "../../actor/actor";
import type { Task, TaskInput } from "./task";

export function createHuntTask(findNewEnemy: HuntFilter): Task {
  return function hunt(input) {
    const { npc, gameState, gameStateServer, areas, rng, npcCombatMemories } =
      input;

    const deadActorsThisTick = gameStateServer.peekEvent("actor.death");
    npcCombatMemories.get(npc.id)?.forgetCombatatants(deadActorsThisTick);

    if (npc.attackTargetId) {
      const target = assert(gameState.actors.get(npc.attackTargetId));
      if (npc.coords.distance(target.coords) > npc.aggroRange) {
        // Target out of range, lose aggro
        npc.attackTargetId = undefined;
        npc.moveTarget = undefined;
        npc.path = undefined;
        // TODO this is temporary until we have a buff/ability system
        npc.speed = 1 as Tile;
      }
      return hunt;
    }

    const newEnemyId = findNewEnemy(input);
    if (newEnemyId !== undefined) {
      npc.attackTargetId = newEnemyId;
      // TODO this is temporary until we have a buff/ability system
      // The idea is that a hunter should cast a speed buff when detecting a new enemy
      npc.speed = 2 as Tile;
      return hunt;
    }

    // If no enemy is in sight, walk to a random location and hope to run into an enemy
    if (!npc.path) {
      const area = assert(areas.get(npc.areaId));
      const toNode = rng.oneOf(area.graph.getNodes());
      npc.moveTarget = toNode.data.vector;
      // TODO this is temporary until we have a buff/ability system
      npc.speed = 1 as Tile;
    }

    return hunt;
  };
}

type HuntFilter = (input: TaskInput) => ActorId | undefined;
type HuntFilterOutput = ActorId | undefined;

export function defensiveHuntFilter({
  gameState,
  npc,
  npcCombatMemories,
}: TaskInput): HuntFilterOutput {
  const combatMemory = npcCombatMemories.get(npc.id);
  const target = gameState.actors
    .values()
    .find(
      (candidate) =>
        candidate.health > 0 &&
        candidate.coords.distance(npc.coords) <= npc.aggroRange &&
        combatMemory?.hasAttackedEachOther(candidate.id, npc.id),
    );
  return target?.id;
}

export function aggressiveHuntFilter({
  gameState,
  npc,
}: TaskInput): HuntFilterOutput {
  const target = gameState.actors
    .values()
    .find(
      (candidate) =>
        candidate.health > 0 &&
        candidate.type === "character" &&
        candidate.coords.distance(npc.coords) <= npc.aggroRange,
    );
  return target?.id;
}

export function protectiveHuntFilter({
  gameState,
  npc,
  npcCombatMemories,
}: TaskInput): HuntFilterOutput {
  const combatMemory = npcCombatMemories.get(npc.id);

  // Consider other npcs of the same spawn allies
  const allyIds = new Set(
    gameState.actors
      .values()
      .filter(
        (actor) =>
          actor.id !== npc.id &&
          actor.type === "npc" &&
          actor.spawnId === npc.spawnId,
      )
      .map((actor) => actor.id),
  );

  // Actors attacking allies are considered enemies
  const enemyIds = new Set(
    combatMemory?.combats.flatMap(([actor1, actor2]) => {
      if (allyIds.has(actor1)) {
        return [actor2];
      } else if (allyIds.has(actor2)) {
        return [actor1];
      }
      return [];
    }),
  );

  const target = gameState.actors.values().find((candidate) => {
    if (
      candidate.health <= 0 ||
      candidate.coords.distance(npc.coords) > npc.aggroRange
    ) {
      return false;
    }

    return (
      combatMemory?.hasAttackedEachOther(candidate.id, npc.id) ||
      enemyIds.has(candidate.id)
    );
  });

  return target?.id;
}
