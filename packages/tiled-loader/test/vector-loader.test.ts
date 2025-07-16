import { describe, it, expect } from "vitest";
import {
  createVectorTiledLoader,
  formatValidationError,
} from "../src/vector-loader";
import sampleMap from "./fixtures/map.json";

describe("Vector Tiled Loader", () => {
  it("should parse a simple Tiled map and transform to Vector types", async () => {
    const loader = createVectorTiledLoader({
      loadFile: () => Promise.resolve(sampleMap),
    });

    const result = await loader.load("test.json");

    if (result.isErr()) {
      throw new Error(
        `Failed to parse map: ${formatValidationError(result.error)}`,
      );
    }

    const map = result.value;

    // Test basic map properties
    expect(map.type).toBe("map");
    expect(map.version).toBe("1.10");

    // Test Vector transformation
    expect(map.mapSize).toBeDefined();
    expect(map.mapSize.x).toBe(58); // width as Tile
    expect(map.mapSize.y).toBe(47); // height as Tile

    expect(map.tileSize).toBeDefined();
    expect(map.tileSize.x).toBe(16); // tilewidth as Pixel
    expect(map.tileSize.y).toBe(16); // tileheight as Pixel

    // Test Vector methods are available
    expect(typeof map.mapSize.distance).toBe("function");
    expect(typeof map.tileSize.scale).toBe("function");

    // Calculate map size in pixels using Vector operations
    const mapSizeInPixels = map.mapSize.scale(map.tileSize);
    expect(mapSizeInPixels.x).toBe(928); // 58 * 16
    expect(mapSizeInPixels.y).toBe(752); // 47 * 16
  });

  it("should parse raw data directly", () => {
    const loader = createVectorTiledLoader({
      loadFile: () => Promise.resolve({}),
    });

    const result = loader.parse(sampleMap);

    if (result.isErr()) {
      throw new Error(
        `Failed to parse map: ${formatValidationError(result.error)}`,
      );
    }

    const map = result.value;
    expect(map.type).toBe("map");
    expect(map.mapSize.x).toBe(58);
    expect(map.mapSize.y).toBe(47);
  });

  it("should handle validation errors gracefully", () => {
    const loader = createVectorTiledLoader({
      loadFile: () => Promise.resolve({}),
    });

    const result = loader.parse({ invalid: "data" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("validation_error");
      const formatted = formatValidationError(result.error);
      expect(formatted).toContain("Validation failed");
    }
  });
});
