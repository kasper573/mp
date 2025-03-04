import type { Branded } from "@mp/std";

export interface FileReference {
  filepath: PathToLocalFile;
  url: UrlToPublicFile;
}

export type PathToLocalFile = Branded<string, "PathToLocalFile">;
export type UrlToPublicFile = Branded<string, "UrlToPublicFile">;
