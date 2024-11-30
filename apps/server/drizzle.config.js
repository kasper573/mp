// Important: Do not import anything in this file,
// since it's uploaded isolated to the server as part of deployment

console.log(
  "drizzle.config.js with MP_DATABASE_URL:",
  process.env.MP_DATABASE_URL,
);

/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./src/modules/*/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MP_DATABASE_URL,
  },
};
