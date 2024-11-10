import { clientEnvGlobalVarName, type ClientEnv } from "@mp/server";

export const env: ClientEnv = Reflect.get(
  window,
  clientEnvGlobalVarName,
) as ClientEnv;

if (!env) {
  throw new Error("Client environment not found");
}
