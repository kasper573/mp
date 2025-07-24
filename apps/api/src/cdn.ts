import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import { type } from "@mp/validate";

export const ctxCdnResolver = InjectionContext.new<CdnResolver>("CdnResolver");

export interface CdnResolver {
  abs: (...relativePath: string[]) => PublicUrl;
  dir: <FileInDir extends string>(
    ...relativePath: string[]
  ) => Promise<FileInDir[]>;
}

export function createCdnResolver(baseUrl: string): CdnResolver {
  function abs(...relativePath: string[]) {
    const url = new URL(relativePath.join("/"), baseUrl);
    return url.toString() as PublicUrl;
  }

  async function dir<FileInDir extends string>(...relativePath: string[]) {
    const url = abs(...relativePath);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch directory: ${response.statusText}`);
    }
    const json = await response.json();
    const entries = CaddyDirectoryEntry.array().from(json);
    return entries.map((entry) => entry.name as FileInDir);
  }

  return {
    abs,
    dir,
  };
}

const CaddyDirectoryEntry = type({
  name: "string",
  size: "number",
  url: "string",
  mod_time: "string",
  mode: "number",
  is_dir: "boolean",
  is_symlink: "boolean",
});

interface CaddyDirectoryEntry {
  name: string;
  size: number;
  url: string;
  mod_time: string;
  mode: number;
  is_dir: boolean;
  is_symlink: boolean;
}
