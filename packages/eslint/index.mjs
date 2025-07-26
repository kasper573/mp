// @ts-check

import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../",
);

export default tseslint.config(
  {
    // Ignores must be defined as the only key in the config object to be interpreted as global ignores
    ignores: [
      "**/node_modules/**",
      "**/out/**",
      "**/dist/**",
      "**/docker/**.js",
      "pnpm-lock.yaml",
      "**/apps/server/public/tilesets/**",
      "**/.tanstack/**",
      "**/.playwright/**",
      "**/*.generated.*",
      "**/*.gen.*",
      "eslint.config.mjs",
    ],
  },
  {
    files: ["ts", "tsx"].map((ext) => `**/*.${ext}`),
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
        alwaysTryTypes: true,
        project: ["./apps/*/tsconfig.json", "./packages/*/tsconfig.json"],
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-array-sort-compare": "error",
    },
  },
);
