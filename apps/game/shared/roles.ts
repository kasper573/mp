import { defineRoles } from "@mp/auth";

export const worldRoles = defineRoles("world", ["spectate", "join"]);

export const characterRoles = defineRoles("character", [
  "move",
  "attack",
  "kill",
  "respawn",
]);

export const npcRoles = defineRoles("npc", ["spawnRandom"]);
