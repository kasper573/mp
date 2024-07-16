import { z, mode, numeric } from "@mp/validate";
import * as dotenv from "dotenv-flow";

const canNeverHappen = "^(?=a)b";

const schema = z.object({
  mode: mode.default("development"),
  trpcPath: z.string().default("/trpc"),
  corsOrigin: z
    .string()
    .default(canNeverHappen)
    .transform((exp) => new RegExp(exp)),
  logFormat: z.enum(["tiny", "short", "dev", "combined"]).default("combined"),
  runtime: z.discriminatedUnion("type", [
    z.object({ type: z.literal("lambda") }),
    z.object({ type: z.literal("server"), port: numeric }),
  ]),
});

const { parsed: realEnv = {} } = dotenv.config();

export const env = schema.parse({
  mode: realEnv.NODE_ENV,
  corsOrigin: realEnv.CORS_ORIGIN_REGEX,
  trpcPath: realEnv.TRPC_PATH,
  logFormat: realEnv.LOG_FORMAT,
  runtime:
    realEnv.SERVE_ON_PORT !== undefined
      ? { type: "server", port: realEnv.SERVE_ON_PORT }
      : { type: "lambda" },
});
