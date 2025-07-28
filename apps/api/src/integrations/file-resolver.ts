import type { UrlString } from "@mp/std";
import { type } from "@mp/validate";

/**
 * internal: url that only works within the docker network,
 * public: on the internet
 */
export const FileUrlType = type.enumerated("internal", "public");
export type FileUrlType = typeof FileUrlType.infer;

export interface FileResolver {
  /**
   * Returns an absolute URL for the given relative path.
   */
  abs: (relativePath: string[], type: FileUrlType) => UrlString;

  /**
   * Returns a list of filenames in the given directory.
   */
  dir: <FileInDir extends string>(
    relativePath: string[],
  ) => Promise<FileInDir[]>;
}

export function createFileResolver(
  internalBaseUrl: string,
  publicBaseUrl: string,
): FileResolver {
  function internalUrl(...relativePath: string[]): string {
    const url = new URL(relativePath.join("/"), internalBaseUrl);
    return url.toString();
  }

  function publicUrl(...relativePath: string[]) {
    const url = new URL(relativePath.join("/"), publicBaseUrl);
    return url.toString();
  }

  function abs(
    relativePath: string[],
    type: FileUrlType = "internal",
  ): UrlString {
    switch (type) {
      case "internal":
        return internalUrl(...relativePath);
      case "public":
        return publicUrl(...relativePath);
    }
  }

  async function dir<FileInDir extends string>(relativePath: string[]) {
    const url = internalUrl(...relativePath);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      const json = await response.json();
      const entries = DirectoryEntry.array().from(json);
      return entries.map((entry) => entry.name as FileInDir);
    } catch (error) {
      throw new Error(`Failed to look up directory at ${url}`, {
        cause: error,
      });
    }
  }

  return {
    abs,
    dir,
  };
}

const DirectoryEntry = type({
  name: type("string").pipe(trimSlashes),
  size: "number",
  url: "string",
  mod_time: "string",
  mode: "number",
  is_dir: "boolean",
  is_symlink: "boolean",
});

function trimSlashes(str: string): string {
  if (str.startsWith("/")) {
    str = str.substring(1);
  }
  if (str.endsWith("/")) {
    str = str.substring(0, str.length - 1);
  }
  return str;
}
