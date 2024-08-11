export const env = {
  mode: import.meta.env.NODE_ENV,
  serverUrl: import.meta.env.MP_SERVER_URL || "ws://localhost:4000",
};
