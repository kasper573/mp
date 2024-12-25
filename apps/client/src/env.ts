import type { FlatObject } from "@mp/env";
import { parseEnv } from "@mp/env";
import { clientEnvSchema, type ClientEnv } from "@mp/server";

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
