import { defineConfig } from "vitest/config";
import ts from "typescript";

export default defineConfig({
  oxc: false,
  plugins: [
    {
      name: "ts-decorators",
      enforce: "pre",
      transform(code, id) {
        if (!id.endsWith(".ts")) {
          return null;
        }
        const result = ts.transpileModule(code, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            useDefineForClassFields: true,
          },
          fileName: id,
        });
        return { code: result.outputText, map: result.sourceMapText };
      },
    },
  ],
});
