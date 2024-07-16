import { z, mode, numeric } from "@mp/validate";

const schema = z.object({
  mode: mode.default("development"),
  logFormat: z.enum(["tiny", "short", "dev", "combined"]).default("combined"),
  port: numeric.default(1234),
});

export const env = schema.parse({
  mode: process.env.NODE_ENV,
  logFormat: process.env.LOG_FORMAT,
  port: process.env.PORT,
});
