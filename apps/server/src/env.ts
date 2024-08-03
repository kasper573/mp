export const env = {
  host: process.env.MP_SERVER_HOST || "host-missing",
  wsPort: parseInt(process.env.MP_SERVER_WS_PORT!) || -1,
  httpPort: parseInt(process.env.MP_SERVER_HTTP_PORT!) || -1,
  httpCorsOrigin: process.env.MP_SERVER_HTTP_CORS_ORIGIN || "origin-missing",
  tickInterval: parseInt(process.env.MP_SERVER_TICK_INTERVAL!) || 1000 / 60,
};
