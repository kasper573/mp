/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import path from "node:path";
import { fileURLToPath } from "node:url";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import solid from "eslint-plugin-solid/configs/typescript";
import * as tsParser from "@typescript-eslint/parser";
import boundariesPlugin from "eslint-plugin-boundaries";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
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
      "**/*.generated.*",
      "**/*.gen.*",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
  monorepoCopPlugin.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
        alwaysTryTypes: true,
        project: [
          "./tsconfig.json",
          "./apps/*/tsconfig.json",
          "./libraries/*/tsconfig.json",
        ],
      },
    },
  },
  {
    rules: {
      "no-undef": "off", // Gives false negatives. We already have typescript to catch these.
      "no-console": "error",
    },
  },
  {
    languageOptions: { parser: tsParser },
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImportsPlugin,
      boundaries: boundariesPlugin,
      "monorepo-cop": monorepoCopPlugin,
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
      "@typescript-eslint/no-empty-object-type": "off",

      // Gives false positives for branded number types
      "@typescript-eslint/no-unsafe-unary-minus": "off",

      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "variableLike", format: ["camelCase", "PascalCase"] },
      ],

      "boundaries/element-types": [
        2,
        {
          default: "disallow",
          message: "${file.type} is not allowed to import ${dependency.type}",
          rules: [
            {
              from: ["app"],
              allow: ["app", "package"],
            },
            {
              from: ["client_app"],
              allow: ["app", "package"],
            },
            {
              from: ["package"],
              allow: ["package"],
            },
          ],
        },
      ],
    },
    settings: {
      "boundaries/elements": [
        { type: "client_app", pattern: "apps/client/**" },
        { type: "app", pattern: "apps/*" },
        { type: "package", pattern: "libraries/*" },
      ],
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...solid,
    languageOptions: {
      parser: tsParser,
    },
  },
  eslintPluginUnicorn.configs["flat/recommended"],
  {
    rules: {
      // I don't mind these
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-array-callback-reference": "off",
      "unicorn/prefer-global-this": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/prefer-spread": "off",

      // export default foo where foo is an import is useful inside worker thread files
      "unicorn/prefer-export-from": "off",

      // Typescript already catches these type of errors
      "unicorn/switch-case-braces": "off",

      // Sometimes null has to be used
      "unicorn/no-null": "off",

      // Gives false negatives, warns about non DOM functions
      "unicorn/prefer-dom-node-remove": "off",
      "unicorn/require-array-join-separator": "off",
      "unicorn/no-array-method-this-argument": "off",

      // It's not worth the effort, some tooling does require it
      "unicorn/prefer-module": "off",

      // Ternary bad
      "unicorn/prefer-ternary": "off",

      // Collides with prettier
      "unicorn/number-literal-case": "off",

      // Has false positives
      "unicorn/no-useless-undefined": "off",
      "unicorn/prefer-includes": "off",
    },
  },
);
