import {
  characterRoles,
  npcRoles,
  systemRoles,
  worldRoles,
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
  worldRoles.join,
];

export const groupedRoles = {
  admin: [
    ...playerRoles,
    systemRoles.changeSettings,
    systemRoles.useDevTools,
    characterRoles.kill,
    npcRoles.spawnRandom,
    worldRoles.spectate,
  ],
  [playerGroup]: playerRoles,
} satisfies Record<string, string[]>;
