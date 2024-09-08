export const env = {
  mode: import.meta.env.MODE,
  serverUrl: (import.meta.env.MP_SERVER_URL as string) || "ws://localhost:4000",
};
