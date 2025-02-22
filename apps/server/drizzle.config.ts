/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./src/modules/*/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: Deno.env.get("MP_SERVER_DATABASE_URL"),
  },
};
