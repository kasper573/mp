import path from "node:path";
import type { PathToLocalFile, UrlToPublicFile } from "@mp/data";
import type { ServerOptions } from "./options";

export function createUrlResolver(
  opt: Pick<ServerOptions, "httpBaseUrl" | "publicDir" | "publicPath">,
) {
  return function urlToPublicFile(
    fileInPublicDir: PathToLocalFile,
  ): UrlToPublicFile {
    const relativePath = path.isAbsolute(fileInPublicDir)
      ? path.relative(opt.publicDir, fileInPublicDir)
      : fileInPublicDir;
    return `${opt.httpBaseUrl}${opt.publicPath}${relativePath}` as UrlToPublicFile;
  };
}
