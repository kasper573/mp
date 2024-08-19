import type { LoaderContext } from "../context";
import type { FilePath } from "../schema/common";

export function reconcileFilePath(
  context: LoaderContext,
  path: string,
): FilePath {
  return context.relativePath(path, context.basePath) as FilePath;
}
