import { defineRoles } from "@mp/auth";

export const systemRoles = defineRoles("sys", [
  "changeSettings",
  "useDevTools",
]);

export const gatewayRoles = defineRoles("gateway", [
  "spectate",
  "join",
  "gameServiceBroadcast",
]);

export const characterRoles = defineRoles("character", [
  "move",
  "attack",
  "kill",
  "respawn",
]);

export const npcRoles = defineRoles("npc", ["spawnRandom"]);
