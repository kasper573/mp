export const env = {
  wsPort: parseInt(process.env.WS_PORT!) || -1,
  httpPort: parseInt(process.env.PORT!) || -1,
  httpPublicHostname: process.env.PUBLIC_HOSTNAME || "public-hostname-missing",
  httpListenHostname: process.env.LISTEN_HOSTNAME || "listen-hostname-missing",
  httpCorsOrigin: process.env.CORS_ORIGIN || "origin-missing",
  tickInterval: parseInt(process.env.TICK_INTERVAL!) || 1000 / 60,
};
