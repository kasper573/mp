import { mode, z } from "@mp/validate";

const schema = z.object({
  mode: mode.default("development"),
  wsServerUrl: z.string().default("ws://localhost/server-url-missing"),
  httpServerUrl: z.string().default("http://localhost/server-url-missing"),
});

export const env = schema.parse({
  mode: process.env.NODE_ENV,
  wsServerUrl: process.env.MP_WS_SERVER_URL,
  httpServerUrl: process.env.MP_HTTP_SERVER_URL,
});
