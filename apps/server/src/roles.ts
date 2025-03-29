import { characterRoles, npcRoles } from "@mp-modules/game/server";

export const playerGroup = "player";

/**
 * This is the single source of truth of groups and roles.
 * Changing this will provision updates in keycloak when pushed to production.
 */
export const groupedRoles = {
  admin: [characterRoles.kill, npcRoles.spawnRandom],
  [playerGroup]: [
    characterRoles.join,
    characterRoles.move,
    characterRoles.attack,
    characterRoles.respawn,
  ],
};
