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
      "**/.playwright/**",
      "**/*.generated.*",
      "**/*.gen.*",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
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
          "./packages/*/tsconfig.json",
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

      // Too strict, can't interpolate branded types into strings
      "@typescript-eslint/restrict-template-expressions": "off",

      // I disagree that it's confusing to implicitly return void in arrow functions. It's not.
      "@typescript-eslint/no-confusing-void-expression": "off",

      // Can give false positives when using NoInfer.
      "@typescript-eslint/no-unnecessary-type-parameters": "off",

      // Too strict, but can be turned on when you're cleaning up deprecations
      "@typescript-eslint/no-deprecated": "off",

      // Too strict
      "@typescript-eslint/no-dynamic-delete": "off",

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

      // Gives false positives for when using decorator auto accessors
      "@typescript-eslint/no-extraneous-class": "off",

      "no-restricted-syntax": [
        "error",
        {
          selector: `MemberExpression[object.name="Math"][property.name="random"]`,
          message:
            "Do not use Math.random(). Use a Rng class from @mp/std instead.",
        },
        ...["PropertyDefinition", "AccessorProperty"].map((base) => ({
          selector: `${base}[definite = true]`,
          message: "Definite assignment assertions are not allowed.",
        })),
      ],

      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["strictCamelCase", "StrictPascalCase"],
        },
        // {
        //   selector: "objectLiteralProperty",
        //   format: ["camelCase", "PascalCase"],
        // },
        {
          selector: [
            "classProperty",
            "objectLiteralProperty",
            "typeProperty",
            "classMethod",
            "objectLiteralMethod",
            "typeMethod",
            "accessor",
            "enumMember",
          ],
          format: null,
          modifiers: ["requiresQuotes"],
        },
      ],

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
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      // It's fine to use non null assertions in tests
      "@typescript-eslint/no-non-null-assertion": "off",
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

      // I have CLI apps
      "unicorn/no-process-exit": "off",

      // Has false positives
      "unicorn/no-useless-undefined": "off",
      "unicorn/prefer-includes": "off",
    },
  },
);
