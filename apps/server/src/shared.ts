// This file should only expose runtime code that is shared between client/server.
// This should end up being primarily constants and utility functions.
export const clientEnvGlobalVarName = "__MP_ENV__";
export const tokenHeaderName = "token";
export { default as transformer } from "superjson";
