import { defineRoles } from "@mp/auth";

// This is the single source of truth of groups and roles.
// Changing this will provision updates in keycloak when pushed to production.

export const systemRoles = defineRoles("sys", [
  "changeSettings",
  "useDevTools",
]);

export const userRoles = defineRoles("user", ["join", "spectate"]);

export const characterRoles = defineRoles("character", [
  "move",
  "attack",
  "kill",
  "respawn",
  "recall",
]);

export const npcRoles = defineRoles("npc", ["spawnRandom"]);

export const playerGroup = "player";

export const playerRoles = [
  characterRoles.move,
  characterRoles.attack,
  characterRoles.respawn,
  characterRoles.recall,
  userRoles.join,
];

export const groupedRoles = {
  admin: [
    ...Object.values(systemRoles),
    ...Object.values(userRoles),
    ...Object.values(characterRoles),
    ...Object.values(npcRoles),
  ],
  [playerGroup]: playerRoles,
} satisfies Record<string, string[]>;
