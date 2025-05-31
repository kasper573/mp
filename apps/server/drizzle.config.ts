/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MP_SERVER_DATABASE_URL,
  },
};
