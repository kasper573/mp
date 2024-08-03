// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

export default tseslint.config(
  {
    // Ignores must be defined as the only key in the config object to be interpreted as global ignores
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/.turbo/",
      "pnpm-lock.yaml",
      "**/apps/server/public/tilesets/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-undef": "off", // Gives false negatives. We already have typescript to catch these.
      "no-console": "error",
    },
  },
  {
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImportsPlugin,
    },
    rules: {
      // Consistent order of imports makes a modules dependencies easier to grasp mentally for humans
      "import/order": ["error"],

      // Automatically removes unused imports. Reduces need for tree shaking in builds.
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/no-unused-vars": "off", // Turning off no-unused-vars is recommended by the unused-imports plugin

      // Automatically enforces type-only imports. Reduces need for tree shaking in builds.
      "@typescript-eslint/consistent-type-imports": "warn",

      // {} is useful as empty set
      "@typescript-eslint/ban-types": "off",
    },
  },
);
