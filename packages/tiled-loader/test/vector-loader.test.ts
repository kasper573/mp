import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import type { CreateTiledLoaderWithVectorsOptions } from "../src/vector-loader";
import { createTiledLoaderWithVectors } from "../src/vector-loader";

const loadJson = (p: string) => fs.readFile(p, "utf8").then(JSON.parse);

const loaderOptions: CreateTiledLoaderWithVectorsOptions = {
  loadJson,
  relativePath: (p, b) => path.resolve(path.dirname(b), p),
};

const tmjPath = path.resolve(__dirname, "./fixtures/map.json");

it("can parse with Vector types and reconciliation", async () => {
  const load = createTiledLoaderWithVectors(loaderOptions);
  const result = await load(tmjPath);
  
  if (result.isErr()) {
    console.error("Error loading map:", result.error);
  }
  
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
    
    expect(map.parallaxOrigin).toBeDefined();
    expect(map.parallaxOrigin.x).toBe(0);
    expect(map.parallaxOrigin.y).toBe(0);
    
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
    
    // Check that original properties are preserved for compatibility
    expect(map.width).toBe(58);
    expect(map.height).toBe(47);
    expect(map.tilewidth).toBe(16);
    expect(map.tileheight).toBe(16);
    
    // Check that reconciliation worked (tilesets should be populated)
    expect(map.tilesets.length).toBeGreaterThan(0);
  }
});

it("transforms objects with Vector types", async () => {
  const load = createTiledLoaderWithVectors(loaderOptions);
  const result = await load(tmjPath);
  
  expect(result.isErr()).toBe(false);
  
  if (result.isOk()) {
    const map = result.value;
    
    // Find an object layer
    const objectLayer = map.layers.find(layer => layer.type === "objectgroup");
    
    if (objectLayer && objectLayer.objects && objectLayer.objects.length > 0) {
      const firstObject = objectLayer.objects[0];
      
      // Check that objects have Vector types
      expect(firstObject.position).toBeDefined();
      expect(firstObject.size).toBeDefined();
      
      // Check that original properties are preserved
      expect(firstObject.x).toBeDefined();
      expect(firstObject.y).toBeDefined();
      expect(firstObject.width).toBeDefined();
      expect(firstObject.height).toBeDefined();
    }
  }
});