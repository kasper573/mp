import type { InferOutput } from "@mp/env";
import { assertEnv, csv, object, string } from "@mp/env";
import { serverOptionsSchema } from "./options";

export type AreaServerOptions = InferOutput<typeof areaServerOptionsSchema>;

export const areaServerOptionsSchema = object({
  ...serverOptionsSchema.entries,
  /**
   * Comma-separated list of area IDs that this server should handle
   */
  areaIds: csv(string()),
  /**
   * The URL of the API server for shared operations
   */
  apiServerUrl: string(),
});

export const areaServerOptions = assertEnv(
  areaServerOptionsSchema,
  process.env,
  "MP_AREA_SERVER_",
);
