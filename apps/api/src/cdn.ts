import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";

export const ctxResolver = InjectionContext.new<CdnResolver>("CdnResolver");

export interface CdnResolver {
  abs: (...relativePath: string[]) => PublicUrl;
  dir: <FileInDir extends string>(
    ...relativePath: string[]
  ) => Promise<FileInDir[]>;
}
