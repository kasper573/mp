// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Ignores must be defined as the only key in the config object to be interpreted as global ignores
    ignores: ["**/node_modules/", "**/dist/", "**/.turbo/", "pnpm-lock.yaml"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-undef": "off", // Gives false negatives. We already have typescript to catch these.
    },
  },
);
