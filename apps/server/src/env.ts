export const env = {
  host: process.env.MP_SERVER_HOST || "localhost",
  wsPort: parseInt(process.env.MP_SERVER_WS_PORT!) || 4000,
  httpPort: parseInt(process.env.MP_SERVER_HTTP_PORT!) || 80,
  tickInterval: parseInt(process.env.MP_SERVER_TICK_INTERVAL!) || 1000 / 60,
};
