import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/modules/*/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MP_DATABASE_URL!,
  },
});
