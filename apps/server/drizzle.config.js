// Important: Do not import non-builtin dependencies or repository source code in this file,
// since it's uploaded isolated to the server as part of deployment

/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./src/modules/*/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: Deno.env.get("MP_SERVER_DATABASE_URL"),
  },
};
