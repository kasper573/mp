export type JsonLoader = (path: string) => Promise<unknown>;

export interface LoaderContext {
  loadMap: JsonLoader;
  loadTileset: JsonLoader;
  bufferFromBase64: (base64: string) => Buffer;
}
