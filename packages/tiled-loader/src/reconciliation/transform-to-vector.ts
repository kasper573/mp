import { Vector } from "@mp/math";
import type { Pixel } from "@mp/std";
import type { TiledObject, VectorTiledObject } from "../schema/object";
import type { TiledMap, VectorTiledMap } from "../schema/map";
import type {
  Position,
  Size,
  TileSize,
  CoordinatePath,
} from "../schema/vector-types";

/**
 * Transforms a legacy TiledObject to a VectorTiledObject with Vector types
 */
export function transformObjectToVector(obj: TiledObject): VectorTiledObject {
  const position = new Vector(obj.x, obj.y) as Position;
  const size = new Vector(obj.width, obj.height) as Size;

  const baseProps = {
    gid: obj.gid,
    id: obj.id,
    name: obj.name,
    position,
    size,
    rotation: obj.rotation,
    type: obj.type,
    visible: obj.visible,
    properties: obj.properties,
  };

  switch (obj.objectType) {
    case "ellipse":
      return {
        ...baseProps,
        objectType: "ellipse",
      };
    case "point":
      return {
        ...baseProps,
        objectType: "point",
      };
    case "polygon":
      return {
        ...baseProps,
        objectType: "polygon",
        polygon: obj.polygon.map(
          (coord) => new Vector(coord.x, coord.y) as Position,
        ) as CoordinatePath,
      };
    case "polyline":
      return {
        ...baseProps,
        objectType: "polyline",
        polyline: obj.polyline.map(
          (coord) => new Vector(coord.x, coord.y) as Position,
        ) as CoordinatePath,
      };
    case "text":
      return {
        ...baseProps,
        objectType: "text",
        text: obj.text,
      };
    case "rectangle":
      return {
        ...baseProps,
        objectType: "rectangle",
      };
  }
}

/**
 * Transforms a legacy TiledMap to a VectorTiledMap with Vector types
 */
export function transformMapToVector(map: TiledMap): VectorTiledMap {
  const mapSize = new Vector(map.width, map.height) as TileSize;
  const tileSize = new Vector(map.tilewidth, map.tileheight) as Position;
  // Handle optional parallax properties with defaults
  const parallaxOrigin = new Vector(
    map.parallaxoriginx ?? (0 as Pixel),
    map.parallaxoriginy ?? (0 as Pixel),
  ) as Position;

  const baseProps = {
    type: map.type,
    version: map.version,
    tiledversion: map.tiledversion,
    tilesets: map.tilesets,
    properties: map.properties,
    layers: map.layers,
    backgroundcolor: map.backgroundcolor,
    class: map.class,
    mapSize,
    tileSize,
    parallaxOrigin,
    infinite: map.infinite,
    compressionlevel: map.compressionlevel,
    nextlayerid: map.nextlayerid,
    nextobjectid: map.nextobjectid,
  };

  switch (map.orientation) {
    case "orthogonal":
      return {
        ...baseProps,
        renderorder: map.renderorder,
        orientation: "orthogonal",
      };
    case "isometric":
      return {
        ...baseProps,
        orientation: "isometric",
      };
    case "staggered":
      return {
        ...baseProps,
        staggeraxis: map.staggeraxis,
        staggerindex: map.staggerindex,
        orientation: "staggered",
      };
    case "hexagonal":
      return {
        ...baseProps,
        hexsidelength: map.hexsidelength,
        staggeraxis: map.staggeraxis,
        staggerindex: map.staggerindex,
        orientation: "hexagonal",
      };
  }
}
