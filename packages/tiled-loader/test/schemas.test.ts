import { describe, it, expect } from "vitest";
import { Vector } from "@mp/math";
import * as v from "valibot";
import { PositionSchema, SizeSchema } from "../src/schemas/common.js";
import { TiledMapSchema } from "../src/schemas/map.js";

describe("New Valibot Schemas", () => {
  it("should transform position coordinates to Vector", () => {
    const input = { x: 10, y: 20 };
    const result = v.parse(PositionSchema, input);

    expect(result).toBeInstanceOf(Vector);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });

  it("should transform size to Vector", () => {
    const input = { width: 100, height: 200 };
    const result = v.parse(SizeSchema, input);

    expect(result).toBeInstanceOf(Vector);
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it("should parse a simple orthogonal map", () => {
    const input = {
      type: "map",
      version: "1.10",
      tiledversion: "1.11.0",
      width: 10,
      height: 20,
      tilewidth: 16,
      tileheight: 16,
      parallaxoriginx: 0,
      parallaxoriginy: 0,
      orientation: "orthogonal",
      renderorder: "right-down",
      infinite: false,
      compressionlevel: -1,
      nextlayerid: 1,
      nextobjectid: 1,
      tilesets: [],
      layers: [],
    };

    const result = v.parse(TiledMapSchema, input);

    expect(result.orientation).toBe("orthogonal");
    expect(result.size).toBeInstanceOf(Vector);
    expect(result.size.x).toBe(10);
    expect(result.size.y).toBe(20);
    expect(result.tileSize).toBeInstanceOf(Vector);
    expect(result.tileSize.x).toBe(16);
    expect(result.tileSize.y).toBe(16);
    expect(result.parallaxOrigin).toBeInstanceOf(Vector);
    expect(result.parallaxOrigin.x).toBe(0);
    expect(result.parallaxOrigin.y).toBe(0);
  });
});
