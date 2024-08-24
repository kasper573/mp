export type JsonLoader = (path: string) => Promise<unknown>;

export interface LoaderContext {
  basePath: string;
  loadJson: JsonLoader;
  relativePath: (p: string, base: string) => string;
}
