import { boolish, type } from "@mp/validate";
import { assertEnv } from "@mp/env";

export type ApiOptions = typeof apiOptionsSchema.infer;

export const apiOptionsSchema = type({
  gatewayWssUrl: "string",
  exposeErrorDetails: boolish(),
  prettyLogs: boolish(),
  version: "string",
}).onDeepUndeclaredKey("delete");

export const opt = assertEnv(apiOptionsSchema, process.env, "MP_API_");
