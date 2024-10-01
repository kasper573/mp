export const env = {
  mode: import.meta.env.MODE,
  serverUrl: (import.meta.env.MP_SERVER_URL as string) || "ws://localhost:4000",
  auth: {
    publishableKey: import.meta.env.MP_AUTH_PUBLISHABLE_KEY as string,
  },
  buildVersion: import.meta.env.MP_BUILD_VERSION as string,
};
