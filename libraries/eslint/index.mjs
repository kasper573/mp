// @ts-check

import boundariesPlugin from "eslint-plugin-boundaries";
import monorepoCopPlugin from "eslint-plugin-monorepo-cop";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

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
    },
    settings: {
      "boundaries/elements": [
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
      "monorepo-cop/no-relative-import-outside-package": "error",
      "boundaries/element-types": [
        2,
        {
          default: "disallow",
          message: "${file.type} is not allowed to import ${dependency.type}",
          rules: [
            { from: "app", allow: ["app", "integration", "library"] },
            { from: "integration", allow: ["integration", "library"] },
            { from: "library", allow: ["library"] },
          ],
        },
      ],
    },
  },
);
