import { characterRoles, npcRoles } from "@mp/game/server";

export const playerGroup = "player";

export const playerRoles = [
  characterRoles.join,
  characterRoles.move,
  characterRoles.attack,
  characterRoles.respawn,
];

/**
 * This is the single source of truth of groups and roles.
 * Changing this will provision updates in keycloak when pushed to production.
 */
export const groupedRoles = {
  admin: [...playerRoles, characterRoles.kill, npcRoles.spawnRandom],
  [playerGroup]: playerRoles,
};
