import type { Branded } from "./Branded";

export interface FileReference {
  filepath: PathToLocalFile;
  url: UrlToPublicFile;
}

export type PathToLocalFile = Branded<string, "PathToLocalFile">;
export type UrlToPublicFile = Branded<string, "UrlToPublicFile">;
