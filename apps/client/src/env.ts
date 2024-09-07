export const env = {
  mode: import.meta.env.NODE_ENV as string,
  serverUrl: (import.meta.env.MP_SERVER_URL as string) || "ws://localhost:4000",
};
