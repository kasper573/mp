import type { LoaderContext } from "../context.ts";
import type { FilePath } from "../schema/common.ts";

/**
 * The tiled file data contains relative file paths.
 *
 * This resolver ensures that all paths resolve into
 * an absolute path based on the file they were defined in.
 *
 * This makes it easier to load the files later on.
 */
export function reconcileFilePath(
  context: LoaderContext,
  path: string,
): FilePath {
  return context.relativePath(path, context.basePath) as FilePath;
}
