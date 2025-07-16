import fs from "node:fs/promises";
import path from "node:path";
import { expect, it, describe } from "vitest";
import type { CreateTiledLoaderOptions } from "../src/loader";
import { createTiledLoader } from "../src/loader";
import { createVectorTiledLoader } from "../src/vector-loader";
import { Vector } from "@mp/math";

const loadJson = (p: string) => fs.readFile(p, "utf8").then(JSON.parse);

const loaderOptions: CreateTiledLoaderOptions = {
  loadJson,
  relativePath: (p, b) => path.resolve(path.dirname(b), p),
};

const tmjPath = path.resolve(__dirname, "./fixtures/map.json");

describe("Legacy Tiled Loader", () => {
  it("can parse without error", async () => {
    const load = createTiledLoader(loaderOptions);
    const result = await load(tmjPath);
    expect(result.isErr()).toBe(false);
  });
});

describe("Vector Tiled Loader", () => {
  it("can parse and transform to Vector types", async () => {
    const load = createVectorTiledLoader(loaderOptions);
    const result = await load(tmjPath);
    expect(result.isErr()).toBe(false);

    if (result.isOk()) {
      const map = result.value;

      // Check that Vector types are being used
      expect(map.mapSize).toBeInstanceOf(Vector);
      expect(map.tileSize).toBeInstanceOf(Vector);
      expect(map.parallaxOrigin).toBeInstanceOf(Vector);

      // Check that Vector properties are accessible
      expect(typeof map.mapSize.x).toBe("number");
      expect(typeof map.mapSize.y).toBe("number");
      expect(typeof map.tileSize.x).toBe("number");
      expect(typeof map.tileSize.y).toBe("number");
      expect(typeof map.parallaxOrigin.x).toBe("number");
      expect(typeof map.parallaxOrigin.y).toBe("number");
    }
  });

  it("produces equivalent data to legacy loader", async () => {
    const legacyLoad = createTiledLoader(loaderOptions);
    const vectorLoad = createVectorTiledLoader(loaderOptions);

    const legacyResult = await legacyLoad(tmjPath);
    const vectorResult = await vectorLoad(tmjPath);

    expect(legacyResult.isErr()).toBe(false);
    expect(vectorResult.isErr()).toBe(false);

    if (legacyResult.isOk() && vectorResult.isOk()) {
      const legacyMap = legacyResult.value;
      const vectorMap = vectorResult.value;

      // Check that core properties match
      expect(vectorMap.type).toBe(legacyMap.type);
      expect(vectorMap.version).toBe(legacyMap.version);
      expect(vectorMap.tiledversion).toBe(legacyMap.tiledversion);
      expect(vectorMap.orientation).toBe(legacyMap.orientation);

      // Check that Vector values match the original individual values
      expect(vectorMap.mapSize.x).toBe(legacyMap.width);
      expect(vectorMap.mapSize.y).toBe(legacyMap.height);
      expect(vectorMap.tileSize.x).toBe(legacyMap.tilewidth);
      expect(vectorMap.tileSize.y).toBe(legacyMap.tileheight);

      // Handle optional parallax properties with defaults
      expect(vectorMap.parallaxOrigin.x).toBe(legacyMap.parallaxoriginx ?? 0);
      expect(vectorMap.parallaxOrigin.y).toBe(legacyMap.parallaxoriginy ?? 0);
    }
  });
});
