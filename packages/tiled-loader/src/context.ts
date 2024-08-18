export type JsonLoader<Args extends unknown[]> = (
  ...args: Args
) => Promise<unknown>;

export interface LoaderContext {
  loadTileset: JsonLoader<[tilesetPath: string]>;
}
