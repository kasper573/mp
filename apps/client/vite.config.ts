import { clientEnvApiPath } from "@mp/server";
import { defineConfig, handlebars } from "@mp/build/vite";

const envFileUrl =
  process.env.NODE_ENV === "production"
    ? clientEnvApiPath
    : `http://k573.localhost${clientEnvApiPath}`;

export default defineConfig({
  plugins: [
    handlebars({
      context: { envFileUrl },
    }),
  ],
});
