export const env = {
  mode: import.meta.env.MODE,
  serverUrl: (import.meta.env.MP_SERVER_URL as string) || "ws://localhost:4000",
  clerk: {
    publishableKey: import.meta.env.MP_CLERK_PUBLISHABLE_KEY as string,
  },
};
