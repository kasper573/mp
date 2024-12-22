import { tsImport } from "tsx/esm/api";

const config: unknown = await tsImport(
  "./vite.config.real.ts",
  import.meta.url,
);

export default config;
