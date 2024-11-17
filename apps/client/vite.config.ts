import { clientEnvApiPath } from "@mp/server";
import { defineConfig, handlebars } from "@mp/build/vite";

if (process.env.MP_CLIENT_URI_TO_SERVER === undefined) {
  throw new Error("env var MP_CLIENT_URI_TO_SERVER is required");
}

export default defineConfig({
  plugins: [
    handlebars({
      context: {
        envFileUrl: `${process.env.MP_CLIENT_URI_TO_SERVER}${clientEnvApiPath}`,
      },
    }),
  ],
});
