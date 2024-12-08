import type { Branded } from "./Branded.ts";

export interface FileReference {
  filepath: PathToLocalFile;
  url: UrlToPublicFile;
}

export type PathToLocalFile = Branded<string, "PathToLocalFile">;
export type UrlToPublicFile = Branded<string, "UrlToPublicFile">;
export type UrlFactory = (path: PathToLocalFile) => UrlToPublicFile;
