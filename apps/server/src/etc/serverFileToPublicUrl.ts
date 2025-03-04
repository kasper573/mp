import path from "node:path";
import type { PathToLocalFile, UrlToPublicFile } from "@mp/data";
import { opt } from "../options";

export function serverFileToPublicUrl(
  fileInPublicDir: PathToLocalFile,
): UrlToPublicFile {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(opt.publicDir, fileInPublicDir)
    : fileInPublicDir;
  return `${opt.httpBaseUrl}${opt.publicPath}${relativePath}` as UrlToPublicFile;
}
