import path from "node:path";
import type { LocalFile, PublicUrl } from "@mp/std";
import { baseServerOptions } from "../options";

export function serverFileToPublicUrl(fileInPublicDir: LocalFile): PublicUrl {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(baseServerOptions.publicDir, fileInPublicDir)
    : fileInPublicDir;
  const url = new URL(
    `${baseServerOptions.httpBaseUrl}${baseServerOptions.publicPath}${relativePath}`,
  );
  return url.toString() as PublicUrl;
}
