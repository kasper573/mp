import type { InferOutput } from "@mp/env";
import { object, string } from "@mp/env";

export type ClientEnv = InferOutput<typeof clientEnvSchema>;

export const clientEnvSchema = object({
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
    /**
     * The relative path the web server should serve the OIDC redirect callback at
     */
    callbackPath: string(),
  }),
});
