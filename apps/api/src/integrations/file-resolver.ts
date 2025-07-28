import type { PublicUrl } from "@mp/std";
import { type } from "@mp/validate";

export interface FileResolver {
  abs: (...relativePath: string[]) => PublicUrl;
  dir: <FileInDir extends string>(
    ...relativePath: string[]
  ) => Promise<FileInDir[]>;
}

export function createFileResolver(baseUrl: string): FileResolver {
  function abs(...relativePath: string[]) {
    const url = new URL(relativePath.join("/"), baseUrl);
    return url.toString() as PublicUrl;
  }

  async function dir<FileInDir extends string>(...relativePath: string[]) {
    const url = abs(...relativePath);
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
