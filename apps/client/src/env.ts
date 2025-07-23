import { parseEnv, type FlatObject } from "@mp/env";
import { csv, numeric, type } from "@mp/validate";

export type ClientEnv = typeof clientEnvSchema.infer;

const clientEnvSchema = type({
  gameServerUrl: "string",
  apiUrl: "string",
  version: "string",
  retryApiQueries: numeric().default(0),
  auth: {
    authority: "string",
    audience: "string",
    /**
     * The full URI that OIDC should redirect back to
     */
    redirectUri: "string",
  },
  faro: {
    receiverUrl: "string",
    propagateTraceHeaderCorsUrls: csv(type("string")),
  },
});

export const env: ClientEnv = getClientEnv();

function getClientEnv(): ClientEnv {
  const obj = Reflect.get(window, "__ENV__") as FlatObject | undefined;

  if (!obj) {
    throw new Error("Client env vars is missing");
  }

  const res = parseEnv(clientEnvSchema, obj, "MP_CLIENT_");

  if (res.isErr()) {
    throw new Error("Invalid client env vars:\n\n" + res.error);
  }

  return res.value;
}
