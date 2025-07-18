import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import type { CreateTiledLoaderOptions } from "../src/loader";
import { createTiledLoader } from "../src/loader";
import { createTiledLoaderWithVectors } from "../src/vector-loader";

const loadJson = (p: string) => fs.readFile(p, "utf8").then(JSON.parse);

const loaderOptions: CreateTiledLoaderOptions = {
  loadJson,
  relativePath: (p, b) => path.resolve(path.dirname(b), p),
};

const tmjPath = path.resolve(__dirname, "./fixtures/map.json");

it("can parse without error (original loader)", async () => {
  const load = createTiledLoader(loaderOptions);
  const result = await load(tmjPath);
  expect(result.isErr()).toBe(false);
});

it("can parse with Vector types (new default loader)", async () => {
  const load = createTiledLoaderWithVectors(loaderOptions);
  const result = await load(tmjPath);
  
  expect(result.isErr()).toBe(false);
  
  if (result.isOk()) {
    const map = result.value;
    
    // Check that Vector types are used
    expect(map.mapSize).toBeDefined();
    expect(map.mapSize.x).toBe(58);
    expect(map.mapSize.y).toBe(47);
    
    expect(map.tileSize).toBeDefined();
    expect(map.tileSize.x).toBe(16);
    expect(map.tileSize.y).toBe(16);
    
    // Check that layers have Vector types
    expect(map.layers.length).toBeGreaterThan(0);
    const firstLayer = map.layers[0];
    expect(firstLayer.offset).toBeDefined();
    expect(firstLayer.tilePosition).toBeDefined();
    
    if (firstLayer.type === "tilelayer") {
      expect(firstLayer.size).toBeDefined();
      expect(firstLayer.size.x).toBe(58);
      expect(firstLayer.size.y).toBe(47);
    }
  }
});
