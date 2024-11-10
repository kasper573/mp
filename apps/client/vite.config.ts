import { clientEnvApiPath } from "@mp/server";
import { defineConfig, handlebars } from "@mp/build/vite";

const envFileUrl =
  process.env.NODE_ENV === "production"
    ? clientEnvApiPath
    : `http://localhost:8080${clientEnvApiPath}`;

export default defineConfig({
  plugins: [
    handlebars({
      context: { envFileUrl },
    }),
  ],
});
