import path from "node:path";
import type { LocalFile, PublicUrl } from "@mp/std";
import { opt } from "../options";

export function serverFileToPublicUrl(fileInPublicDir: LocalFile): PublicUrl {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(opt.publicDir, fileInPublicDir)
    : fileInPublicDir;
  const url = new URL(`${opt.httpBaseUrl}${opt.publicPath}${relativePath}`);
  return url.toString() as PublicUrl;
}
