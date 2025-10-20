import config from "@mp/eslint";

// Note that the vast majority of code style rules are handled by oxlint.
// Eslint provides extra strict rules via typescript-eslint.
// It's not recommended to enable eslint in the editor due to how ridiculously slow it is,
// but you can at your own risk. However eslint rules will still run in the pipeline to help avoid mistakes.

export default [
  ...config,
  {
    ignores: ["**/dbschema/edgeql-js/**"],
  },
];
