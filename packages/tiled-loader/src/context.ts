export type JsonLoader = (path: string) => Promise<unknown>;

export interface LoaderContext {
  loadMap: JsonLoader;
  loadTileset: JsonLoader;
  readBase64: (base64: string) => Uint8Array;
}
