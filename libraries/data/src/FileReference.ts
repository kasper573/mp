import type { Branded } from "@mp/std";

export interface FileReference {
  filepath: LocalFile;
  url: PublicUrl;
}

export type LocalFile = Branded<string, "LocalFile">;
export type PublicUrl = Branded<string, "PublicUrl">;
