import path from "node:path";
import type { LocalFile, PublicUrl } from "@mp/std";
import { opt } from "../options";

export function serverFileToPublicUrl(fileInPublicDir: LocalFile): PublicUrl {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(opt.publicDir, fileInPublicDir)
    : fileInPublicDir;
  const url = new URL(`${opt.httpBaseUrl}${opt.publicPath}${relativePath}`);

  // Add the build version to the URL of all public files to
  // effectively cache bust them when the build version changes.
  // This gives a good cache performance without risking stale files.
  url.searchParams.set("v", opt.buildVersion);

  return url.toString() as PublicUrl;
}
