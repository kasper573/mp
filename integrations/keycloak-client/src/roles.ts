import {
  characterRoles,
  npcRoles,
  systemRoles,
  gatewayRoles,
} from "@mp/game/server";

/**
 * This is the single source of truth of groups and roles.
 * Changing this will provision updates in keycloak when pushed to production.
 */

export const playerGroup = "player";

export const playerRoles = [
  characterRoles.move,
  characterRoles.attack,
  characterRoles.respawn,
  gatewayRoles.join,
];

export const groupedRoles = {
  admin: [
    ...Object.values(systemRoles),
    ...Object.values(gatewayRoles),
    ...Object.values(characterRoles),
    ...Object.values(npcRoles),
  ],
  [playerGroup]: playerRoles,
} satisfies Record<string, string[]>;
