// @ts-check

import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import boundariesPlugin from "eslint-plugin-boundaries";
import monorepoCopPlugin from "eslint-plugin-monorepo-cop";

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
      boundaries: boundariesPlugin,
      "monorepo-cop": monorepoCopPlugin,
    },
    settings: {
      "boundaries/elements": [
        { type: "game_server_module", pattern: "apps/game/server/**" },
        { type: "game_client_module", pattern: "apps/game/client/**" },
        { type: "game_shared_module", pattern: "apps/game/shared/**" },
        { type: "client_app", pattern: "apps/client/**" },
        { type: "server_app", pattern: "apps/server/**" },
        { type: "other_app", pattern: "apps/*" },
        { type: "package", pattern: "packages/*" },
      ],
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-array-sort-compare": "error",
      "monorepo-cop/no-relative-import-outside-package": "error",
      "boundaries/element-types": [
        2,
        {
          default: "disallow",
          message: "${file.type} is not allowed to import ${dependency.type}",
          rules: [
            {
              from: ["server_app"],
              allow: ["game_server_module", "game_shared_module", "package"],
            },
            {
              from: ["client_app"],
              allow: [
                "game_client_module",
                "game_shared_module",
                "server_app",
                "package",
              ],
            },
            {
              from: ["other_app"],
              allow: [
                "package",
                "server_app",
                "game_client_module",
                "game_shared_module",
              ],
            },
            {
              from: ["game_client_module"],
              allow: ["game_server_module", "game_shared_module", "package"],
            },
            {
              from: ["game_server_module"],
              allow: ["game_shared_module", "package"],
            },
            {
              from: ["game_shared_module", "package"],
              allow: ["package"],
            },
          ],
        },
      ],
    },
  },
);
