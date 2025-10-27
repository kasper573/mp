// @ts-check

import boundariesPlugin from "eslint-plugin-boundaries";
import monorepoCopPlugin from "eslint-plugin-monorepo-cop";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import { requireDbResultReturn } from "./db-rules.mjs";

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
      "**/docker/file-server/public/**",
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
        project: ["apps", "integrations", "libraries"].map(
          (workspace) => `./${workspace}/*/tsconfig.json`,
        ),
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      boundaries: boundariesPlugin,
      "monorepo-cop": monorepoCopPlugin,
      "mp-db": {
        rules: {
          "require-db-result-return": requireDbResultReturn,
        },
      },
    },
    settings: {
      "boundaries/elements": [
        {
          type: "game-service-typedef",
          pattern: "apps/game-service/src/package.ts",
          mode: "file",
        },
        { type: "app", pattern: "apps/*/src/**" },
        { type: "integration", pattern: "integrations/*/src/**" },
        { type: "library", pattern: "libraries/**" },
      ],
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "mp-db/require-db-result-return": "warn",
      "monorepo-cop/no-relative-import-outside-package": "error",
      "boundaries/element-types": [
        2,
        {
          default: "disallow",
          message: "${file.type} is not allowed to import ${dependency.type}",
          rules: [
            // Dependency order: app -> integration -> library
            // Exception: integrations may use game service typedefs
            {
              from: ["app", "game-service-typedef"],
              allow: ["app", "game-service-typedef", "integration", "library"],
            },
            {
              from: "integration",
              allow: ["game-service-typedef", "integration", "library"],
            },
            { from: "library", allow: ["library"] },
          ],
        },
      ],
    },
  },
);
