export const env = {
  host: process.env.HOST || "host-missing",
  wsPort: parseInt(process.env.WS_PORT!) || -1,
  httpPort: parseInt(process.env.PORT!) || -1,
  httpCorsOrigin: process.env.CORS_ORIGIN || "origin-missing",
  tickInterval: parseInt(process.env.TICK_INTERVAL!) || 1000 / 60,
};
