import type { Cleanup } from "@rift/module";
import type { RiftServerEvent } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import type { Tile } from "@mp/std";
import type { AreaResource } from "../area/area-resource";
import type { AreaId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { NpcAi } from "./components";
import { Combat } from "../combat/components";
import { Movement } from "../movement/components";

export interface NpcAiOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
}

export class NpcAiModule extends RiftServerModule {
  readonly #areas: ReadonlyMap<AreaId, AreaResource>;

  constructor(opts: NpcAiOptions) {
    super();
    this.#areas = opts.areas;
  }

  init(): Cleanup {
    return this.server.on(Tick, this.#onTick);
  }

  #onTick = (_event: RiftServerEvent<{ tick: number; dt: number }>): void => {
    for (const [id, ai, mv, areaTag] of this.server.world.query(
      NpcAi,
      Movement,
      AreaTag,
    )) {
      const combat = this.server.world.get(id, Combat);
      if (combat && !combat.alive) continue;
      if (mv.moveTarget || mv.path.length > 0) continue;
      const area = this.#areas.get(areaTag.areaId);
      if (!area) continue;
      if (ai.npcType === "static" || ai.npcType === "patrol") continue;
      const target = pickWanderTarget(mv.coords, area);
      if (target) {
        this.server.world.set(id, Movement, { ...mv, moveTarget: target });
      }
    }
  };
}

function pickWanderTarget(
  current: { x: number; y: number },
  area: AreaResource,
): { x: Tile; y: Tile } | undefined {
  const radius = 5;
  const dx = (Math.random() * 2 - 1) * radius;
  const dy = (Math.random() * 2 - 1) * radius;
  void area;
  return {
    x: (current.x + dx) as Tile,
    y: (current.y + dy) as Tile,
  };
}
