/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import solid from "eslint-plugin-solid/configs/typescript";
import * as tsParser from "@typescript-eslint/parser";
import monorepoCopPlugin from "eslint-plugin-monorepo-cop";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

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
        tsconfigRootDir: import.meta.dirname,
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
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImportsPlugin,
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
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...solid,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "tsconfig.json",
      },
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

      // Typescript already catches these type of errors
      "unicorn/switch-case-braces": "off",

      // Sometimes null has to be used
      "unicorn/no-null": "off",

      // Gives false negatives, warns about non DOM functions
      "unicorn/prefer-dom-node-remove": "off",
      "unicorn/require-array-join-separator": "off",

      // It's not worth the effort, some tooling does require it
      "unicorn/prefer-module": "off",

      // Ternary bad
      "unicorn/prefer-ternary": "off",

      // Collides with prettier
      "unicorn/number-literal-case": "off",

      // Has false positives
      "unicorn/no-useless-undefined": "off",
    },
  },
);
