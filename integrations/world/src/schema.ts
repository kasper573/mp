import { defineSchema, type RiftSchema } from "@rift/core";
import { fnv1a64 } from "./hash";
import { identityComponents } from "./identity/components";
import { appearanceComponents } from "./appearance/components";
import { movementComponents } from "./movement/components";
import { movementEvents } from "./movement/events";
import { combatComponents } from "./combat/components";
import { combatEvents } from "./combat/events";
import { progressionComponents } from "./progression/components";
import { inventoryComponents } from "./inventory/components";
import { npcComponents } from "./npc/components";
import { itemComponents } from "./item/components";
import { areaComponents } from "./area/components";
import { characterEvents } from "./character/events";

export const schema: RiftSchema = defineSchema({
  components: [
    ...identityComponents,
    ...appearanceComponents,
    ...movementComponents,
    ...combatComponents,
    ...progressionComponents,
    ...inventoryComponents,
    ...npcComponents,
    ...itemComponents,
    ...areaComponents,
  ],
  events: [...characterEvents, ...movementEvents, ...combatEvents],
  hash: fnv1a64,
});
