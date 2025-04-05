import path from "node:path";
import type { LocalFile, PublicUrl } from "@mp/std";
import { opt } from "../options";

export function serverFileToPublicUrl(fileInPublicDir: LocalFile): PublicUrl {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(opt.publicDir, fileInPublicDir)
    : fileInPublicDir;
  return `${opt.httpBaseUrl}${opt.publicPath}${relativePath}` as PublicUrl;
}
