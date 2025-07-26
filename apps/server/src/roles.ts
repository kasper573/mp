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
    ...playerRoles,
    systemRoles.changeSettings,
    systemRoles.useDevTools,
    characterRoles.kill,
    npcRoles.spawnRandom,
    gatewayRoles.spectate,
  ],
  [playerGroup]: playerRoles,
} satisfies Record<string, string[]>;
