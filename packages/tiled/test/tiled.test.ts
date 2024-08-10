import fs from "fs/promises";
import path from "path";
import { expect, it } from "vitest";
import { createTiledLoader } from "../src/loader";

const loadJson = (p: string) => fs.readFile(p, "utf-8").then(JSON.parse);

const loadTiled = (mapPath: string) => {
  return createTiledLoader({
    loadMap: loadJson,
    loadTileset: (tileset) =>
      loadJson(path.resolve(path.dirname(mapPath), tileset)),
  })(mapPath);
};

const tmjPath = path.resolve(__dirname, "fixtures/map.tmj");

it("can parse without error", async () => {
  const result = await loadTiled(tmjPath);
  expect(result.success).toBe(true);
});
