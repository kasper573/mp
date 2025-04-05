import type { FlatObject, InferOutput } from "@mp/env";
import { object, string, parseEnv, csv } from "@mp/env";

export type ClientEnv = InferOutput<typeof clientEnvSchema>;

const clientEnvSchema = object({
  apiUrl: string(),
  wsUrl: string(),
  buildVersion: string(),
  auth: object({
    authority: string(),
    audience: string(),
    /**
     * The full URI that OIDC should redirect back to
     */
    redirectUri: string(),
  }),
  faro: object({
    receiverUrl: string(),
    propagateTraceHeaderCorsUrls: csv(string()),
  }),
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
