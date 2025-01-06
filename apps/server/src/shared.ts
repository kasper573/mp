// This file should only expose runtime code that is shared between client/server.
// This should end up being primarily constants and utility functions.
export const tokenHeaderName = "token";
export const clientViewDistance = 25; // Radius in tiles around the player
export { default as transformer } from "superjson";
