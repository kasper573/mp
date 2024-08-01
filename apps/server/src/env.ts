export const env = {
  host: process.env.MP_SERVER_HOST || "localhost",
  port: parseInt(process.env.MP_SERVER_PORT!) || 2567,
  tickInterval: parseInt(process.env.MP_SERVER_TICK_INTERVAL!) || 1000 / 60,
};
