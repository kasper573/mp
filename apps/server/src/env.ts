import path from "path";

export const env = {
  clientDistPath: process.env.MP_CLIENT_DIST_PATH
    ? path.resolve(process.cwd(), process.env.MP_CLIENT_DIST_PATH)
    : undefined,
  wsPort: parseInt(process.env.MP_WS_PORT!) || -1,
  httpPort: parseInt(process.env.MP_HTTP_PORT!) || -1,
  httpPublicHostname:
    process.env.MP_HTTP_PUBLIC_HOSTNAME || "public-hostname-missing",
  httpListenHostname:
    process.env.MP_HTTP_LISTEN_HOSTNAME || "listen-hostname-missing",
  httpCorsOrigin: process.env.MP_HTTP_CORS_ORIGIN || "origin-missing",
  tickInterval: parseInt(process.env.MP_TICK_INTERVAL!) || 1000 / 60,
};
