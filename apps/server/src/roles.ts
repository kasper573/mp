import { characterRoles, npcRoles, worldRoles } from "@mp/game/server";

import { systemRoles } from "./etc/system-rpc";

export const playerGroup = "player";

export const playerRoles = [
  characterRoles.move,
  characterRoles.attack,
  characterRoles.respawn,
];

/**
 * This is the single source of truth of groups and roles.
 * Changing this will provision updates in keycloak when pushed to production.
 */
export const groupedRoles = {
  admin: [
    ...playerRoles,
    characterRoles.kill,
    npcRoles.spawnRandom,
    systemRoles.admin,
    worldRoles.spectate,
  ],
  [playerGroup]: playerRoles,
} satisfies Record<string, string[]>;
