import { areaModule } from "./area/module";
import { sessionModule } from "./session/module";
import { movementModule } from "./movement/module";
import { combatModule } from "./combat/module";
import { npcModule } from "./npc/module";
import { inventoryModule } from "./inventory/module";
import { visibilityModule } from "./visibility/module";

export {
  areaModule,
  sessionModule,
  movementModule,
  combatModule,
  npcModule,
  inventoryModule,
  visibilityModule,
};

export const modules = [
  areaModule,
  sessionModule,
  movementModule,
  combatModule,
  npcModule,
  inventoryModule,
  visibilityModule,
];
