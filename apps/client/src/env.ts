import { type ClientEnv, clientEnvGlobalVarName } from "@mp/server";

export const env: ClientEnv = getClientEnv();

function getClientEnv(): ClientEnv {
  const envObj = Reflect.get(window, clientEnvGlobalVarName) as
    | ClientEnv
    | undefined;

  if (!envObj) {
    // eslint-disable-next-line no-console
    console.error(
      "Client environment not found. Falling back to empty object. Will likely result in runtime errors.",
    );
    return new Proxy({} as ClientEnv, {
      get() {
        return "client-env-missing-fallback";
      },
    });
  }
  return envObj;
}
