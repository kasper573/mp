import { parseEnv, type FlatObject } from "@mp/env";

export interface ClientEnv {
  gameServiceUrl: string;
  api: {
    url: string;
    subscriptionsUrl: string;
  };
  version: string;
  retryApiQueries: number;
  displayErrorDetails: boolean;
  auth: {
    authority: string;
    audience: string;
    /**
     * The full URI that OIDC should redirect back to
     */
    redirectUri: string;
  };
  faro: {
    receiverUrl: string;
    propagateTraceHeaderCorsUrls: string[];
  };
}

export const env: ClientEnv = getClientEnv();

function getClientEnv(): ClientEnv {
  const obj = Reflect.get(window, "__ENV__") as FlatObject | undefined;

  if (!obj) {
    throw new Error("Client env vars is missing");
  }

  // We blind trust the env object instead of using @mp/validate,
  // since @mp/validate adds ~100kb to the client bundle size.
  const res = parseEnv((v) => v as ClientEnv, obj, "MP_WEBSITE_");

  if (res.isErr()) {
    throw new Error("Invalid client env vars:\n\n" + res.error);
  }

  return res.value;
}
