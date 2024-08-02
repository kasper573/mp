export interface FileReference {
  filepath: PathToLocalFile;
  url: UrlToPublicFile;
}

export type PathToLocalFile = string & { __brand__: "PathToLocalFile" };
export type UrlToPublicFile = string & { __brand__: "UrlToPublicFile" };
