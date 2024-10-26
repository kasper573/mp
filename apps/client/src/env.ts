export const env = {
  mode: import.meta.env.MODE,
  apiUrl:
    (import.meta.env.MP_TRPC_URL as string) || "http://localhost:4000/api",
  wsUrl: (import.meta.env.MP_WS_URL as string) || "ws://localhost:4000",
  auth: {
    publishableKey: import.meta.env.MP_AUTH_PUBLISHABLE_KEY as string,
  },
  buildVersion: import.meta.env.MP_BUILD_VERSION as string,
};
