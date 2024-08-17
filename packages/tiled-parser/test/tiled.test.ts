import fs from "fs/promises";
import path from "path";
import { expect, it } from "vitest";
import { createTiledLoader } from "../src/loader";
import type { LoaderContext } from "../src/context";

const loadJson = (p: string) => fs.readFile(p, "utf-8").then(JSON.parse);

function createLoaderContext(mapPath: string): LoaderContext {
  return {
    bufferFromBase64: (str) => Buffer.from(str, "base64"),
    loadMap: loadJson,
    loadTileset: (tileset) =>
      loadJson(path.resolve(path.dirname(mapPath), tileset)),
  };
}

const tmjPath = path.resolve(__dirname, "fixtures/map.tmj");

it("can parse without error", async () => {
  const load = createTiledLoader(createLoaderContext(tmjPath));
  const result = await load(tmjPath);
  expect(result.success).toBe(true);
});
