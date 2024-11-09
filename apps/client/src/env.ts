export const env = {
  mode: import.meta.env.MODE,
  apiUrl: import.meta.env.MP_API_URL as string,
  wsUrl: import.meta.env.MP_WS_URL as string,
  auth: {
    publishableKey: import.meta.env.MP_AUTH_PUBLISHABLE_KEY as string,
  },
  buildVersion: import.meta.env.MP_BUILD_VERSION as string,
};
