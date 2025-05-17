import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import { assert, randomItem, recordValues } from "@mp/std";
import type { ReadonlyDeep } from "@mp/sync";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { ActorId } from "../traits/actor";
import type { NpcInstance, NpcInstanceId } from "./schema";

export class NpcAi {
  private aiStateLookup = new Map<NpcInstanceId, NpcAiState>();
  constructor(
    private gameState: GameStateMachine,
    private areas: AreaLookup,
  ) {}

  createTickHandler(): TickEventHandler {
    return ({ totalTimeElapsed }) => {
      for (const subject of recordValues(this.gameState.actors())) {
        if (subject.type !== "npc") {
          continue;
        }
        const nextState = this.nextNpcAiState(subject, totalTimeElapsed);
        this.aiStateLookup.set(subject.id, nextState);
      }
    };
  }

  private nextNpcAiState(
    npc: ReadonlyDeep<NpcInstance>,
    totalTimeElapsed: TimeSpan,
  ): NpcAiState {
    const aiState =
      this.aiStateLookup.get(npc.id) ?? initialAiState(npc, totalTimeElapsed);

    switch (aiState.type) {
      case "pacifist":
        switch (aiState.task.type) {
          case "wander":
            if (totalTimeElapsed.compareTo(aiState.task.endTime) > 0) {
              return initialAiState(npc, totalTimeElapsed);
            }
            this.wander(npc);
            break;
          case "idle":
            if (totalTimeElapsed.compareTo(aiState.task.endTime) > 0) {
              return initialAiState(npc, totalTimeElapsed);
            }
            break;
          case "escape":
            // TODO implement
            break;
        }
    }

    return aiState;

    // if (
    //   totalTimeElapsed.totalMilliseconds >=
    //   npcAiState.task.endTime.totalMilliseconds
    // ) {
    //   npcAiState.task = newTask(totalTimeElapsed);
    // }

    // const { task } = npcAiState;

    // switch (task.id) {
    //   case "fight":
    //     if (!npc.attackTargetId) {
    //       const others = Object.values(this.gameState.actors())
    //         .filter(
    //           (other) =>
    //             other.id !== npc.id && isTargetable(npc, other),
    //         )
    //         .map((other) => other.id);
    //       this.gameState.actors.update(npc.id, (u) =>
    //         u.add("attackTargetId", randomItem(others)),
    //       );
    //     }
    //     break;
    //   case "move": {
    //     if (!npc.path) {
    //       const area = this.areas.get(npc.areaId);
    //       if (!area) {
    //         throw new Error(`Area not found: ${npc.areaId}`);
    //       }

    //       const toNode = randomItem(Array.from(area.graph.getNodes()));
    //       if (toNode) {
    //         this.gameState.actors.update(npc.id, (update) =>
    //           update
    //             .add("moveTarget", toNode.data.vector)
    //             .add("attackTargetId", undefined),
    //         );
    //       }
    //     }
    //     break;
    //   }
    // }
  }

  private wander(npc: ReadonlyDeep<NpcInstance>) {
    if (!npc.path) {
      const area = this.areas.get(npc.areaId);
      if (!area) {
        throw new Error(`Area not found: ${npc.areaId}`);
      }

      const toNode = randomItem(Array.from(area.graph.getNodes()));
      if (toNode) {
        this.gameState.actors.update(npc.id, (update) =>
          update
            .add("moveTarget", toNode.data.vector)
            .add("attackTargetId", undefined),
        );
      }
    }
  }
}

function initialAiState(
  npc: ReadonlyDeep<NpcInstance>,
  totalTimeElapsed: TimeSpan,
): NpcAiState {
  switch (npc.aggroType) {
    case "pacifist": {
      const endTime = totalTimeElapsed.add(TimeSpan.fromSeconds(5));
      const potentialInitialTasks: Array<PacifistAiState["task"]> = [
        { type: "wander", endTime },
        { type: "idle", endTime },
      ];
      return {
        type: "pacifist",
        task: assert(randomItem(potentialInitialTasks)),
      };
    }
  }
  return { type: npc.aggroType };
}

type NpcAiState =
  | PacifistAiState
  | ProtectiveAiState
  | DefensiveAiState
  | AggressiveAiState;

interface PacifistAiState {
  type: "pacifist";
  task:
    | { type: "idle"; endTime: TimeSpan }
    | { type: "wander"; endTime: TimeSpan }
    | { type: "escape"; from: ActorId };
}

interface ProtectiveAiState {
  type: "protective";
}

interface DefensiveAiState {
  type: "defensive";
}

interface AggressiveAiState {
  type: "aggressive";
}
