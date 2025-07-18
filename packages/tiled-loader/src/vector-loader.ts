import { err, ok, type Result } from "@mp/std";
import * as v from "valibot";
import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type { LoaderContext } from "./context";
import { reconcileTiledMap } from "./reconciliation/reconcile-tiled-map";

export type CreateTiledLoaderWithVectorsOptions = Omit<LoaderContext, "basePath">;

// Simple schema that matches the input format (we'll transform after validation)
const BasicMapSchema = v.object({
  type: v.literal("map"),
  version: v.string(),
  tiledversion: v.string(),
  orientation: v.string(),
  width: v.number(),
  height: v.number(),
  tilewidth: v.number(),
  tileheight: v.number(),
  infinite: v.boolean(),
  layers: v.array(v.any()),
  tilesets: v.array(v.any()),
  properties: v.optional(v.array(v.any())),
  parallaxoriginx: v.optional(v.number()),
  parallaxoriginy: v.optional(v.number()),
  compressionlevel: v.optional(v.number()),
  nextlayerid: v.optional(v.number()),
  nextobjectid: v.optional(v.number()),
  backgroundcolor: v.optional(v.string()),
  renderorder: v.optional(v.string()),
  staggeraxis: v.optional(v.string()),
  staggerindex: v.optional(v.string()),
  hexsidelength: v.optional(v.number()),
});

export function createTiledLoaderWithVectors(options: CreateTiledLoaderWithVectorsOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderWithVectorsResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      // Load the raw JSON data
      const rawData = await context.loadJson(mapPath);

      // Validate with valibot
      const validatedData = v.parse(BasicMapSchema, rawData);

      // Transform to Vector-based structure
      const tiledMap = transformToVectorMap(validatedData);

      // Apply the original reconciliation logic
      // Note: We cast to the original types for reconciliation compatibility
      await reconcileTiledMap(context, tiledMap as any);

      return ok(tiledMap);
    } catch (error) {
      return err(error);
    }
  };
}

// Vector-based TiledObject types
export interface TiledObjectWithVectors {
  id: number;
  name: string;
  objectType: string;
  visible: boolean;
  rotation: number;
  type?: string;
  properties: any;
  
  // Vector-based properties
  position: Vector<Pixel>;
  size: Vector<Pixel>;
  
  // Keep original properties for compatibility
  x: Pixel;
  y: Pixel;
  width: Pixel;
  height: Pixel;
  
  // Object-specific properties
  gid?: any;
  flags?: any;
  
  // For polygon and polyline objects
  polygon?: any[];
  polyline?: any[];
  polygonVectors?: Vector<Pixel>[];
  polylineVectors?: Vector<Pixel>[];
  
  // For text objects
  text?: any;
  
  // Additional properties
  [key: string]: any;
}

export type TiledLoaderWithVectorsResult = Result<TiledMapWithVectors, unknown>;

// Define the Vector-based types
export interface TiledMapWithVectors {
  type: "map";
  version: string;
  tiledversion: string;
  orientation: string;
  
  // Vector-based properties
  mapSize: Vector<Tile>;
  tileSize: Vector<Pixel>;
  parallaxOrigin: Vector<Pixel>;
  
  // Original properties for compatibility with reconciliation
  width: Tile;
  height: Tile;
  tilewidth: Pixel;
  tileheight: Pixel;
  parallaxoriginx: Pixel;
  parallaxoriginy: Pixel;
  
  infinite: boolean;
  layers: LayerWithVectors[];
  tilesets: any[]; // Keep as any for now since tilesets are complex
  properties: any;
  compressionlevel?: number;
  nextlayerid?: number;
  nextobjectid?: number;
  backgroundcolor?: string;
  renderorder?: string;
  staggeraxis?: string;
  staggerindex?: string;
  hexsidelength?: Pixel;
}

export interface LayerWithVectors {
  id: number;
  name: string;
  type: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  
  // Vector-based properties
  offset: Vector<Pixel>;
  tilePosition: Vector<Tile>;
  
  // Original properties for compatibility
  offsetx: Pixel;
  offsety: Pixel;
  x: Tile;
  y: Tile;
  
  // Properties for specific layer types
  width?: Tile;
  height?: Tile;
  size?: Vector<Tile>; // For tile layers
  
  // Image layer properties
  image?: any;
  repeatx?: boolean;
  repeaty?: boolean;
  transparentcolor?: any;
  
  // Object layer properties
  draworder?: string;
  objects?: TiledObjectWithVectors[];
  
  // Group layer properties
  layers?: LayerWithVectors[];
  
  // Tile layer properties
  tiles?: any[];
  
  // Common properties
  properties?: any;
  class?: any;
  tintcolor?: any;
  parallaxx?: any;
  parallaxy?: any;
  startx?: Pixel;
  starty?: Pixel;
  
  // Additional properties to ensure compatibility
  [key: string]: any;
}

function transformToVectorMap(data: any): TiledMapWithVectors {
  const transformed: TiledMapWithVectors = {
    ...data,
    
    // Add Vector-based properties
    mapSize: new Vector(data.width as Tile, data.height as Tile),
    tileSize: new Vector(data.tilewidth as Pixel, data.tileheight as Pixel),
    parallaxOrigin: new Vector(
      (data.parallaxoriginx || 0) as Pixel,
      (data.parallaxoriginy || 0) as Pixel
    ),
    
    // Transform layers
    layers: data.layers.map(transformLayer),
    
    // Ensure properties exists
    properties: data.properties || [],
    
    // Ensure hexsidelength is properly typed
    hexsidelength: data.hexsidelength as Pixel,
  };
  
  return transformed;
}

function transformLayer(layer: any): LayerWithVectors {
  const transformed: LayerWithVectors = {
    ...layer,
    
    // Add Vector-based properties
    offset: new Vector(
      (layer.offsetx || 0) as Pixel,
      (layer.offsety || 0) as Pixel
    ),
    tilePosition: new Vector(
      (layer.x || 0) as Tile,
      (layer.y || 0) as Tile
    ),
    
    // Ensure required properties exist
    id: layer.id || 0,
    name: layer.name || "",
    type: layer.type || "tilelayer",
    visible: layer.visible !== undefined ? layer.visible : true,
    opacity: layer.opacity !== undefined ? layer.opacity : 1,
    locked: layer.locked !== undefined ? layer.locked : false,
    
    // Keep original properties for compatibility
    offsetx: (layer.offsetx || 0) as Pixel,
    offsety: (layer.offsety || 0) as Pixel,
    x: (layer.x || 0) as Tile,
    y: (layer.y || 0) as Tile,
    
    // Ensure properties exists
    properties: layer.properties || [],
  };
  
  // Add size Vector for tile layers
  if (layer.type === "tilelayer" && layer.width && layer.height) {
    transformed.size = new Vector(layer.width as Tile, layer.height as Tile);
  }
  
  // Transform objects in object layers
  if (layer.type === "objectgroup" && layer.objects) {
    transformed.objects = layer.objects.map(transformObject);
  }
  
  // Transform nested layers (for group layers)
  if (layer.layers) {
    transformed.layers = layer.layers.map(transformLayer);
  }
  
  return transformed;
}

function transformObject(obj: any): TiledObjectWithVectors {
  const transformed: TiledObjectWithVectors = {
    ...obj,
    
    // Ensure required properties
    id: obj.id || 0,
    name: obj.name || "",
    objectType: obj.objectType || "rectangle",
    visible: obj.visible !== undefined ? obj.visible : true,
    rotation: obj.rotation || 0,
    type: obj.type,
    properties: obj.properties || {},
    
    // Add Vector-based properties
    position: new Vector((obj.x || 0) as Pixel, (obj.y || 0) as Pixel),
    size: new Vector((obj.width || 0) as Pixel, (obj.height || 0) as Pixel),
    
    // Keep original properties for compatibility
    x: (obj.x || 0) as Pixel,
    y: (obj.y || 0) as Pixel,
    width: (obj.width || 0) as Pixel,
    height: (obj.height || 0) as Pixel,
  };
  
  // Determine object type from Tiled properties
  if (obj.ellipse) {
    transformed.objectType = "ellipse";
  } else if (obj.point) {
    transformed.objectType = "point";
  } else if (obj.polygon) {
    transformed.objectType = "polygon";
    transformed.polygon = obj.polygon;
    transformed.polygonVectors = obj.polygon.map((coord: any) => 
      new Vector(coord.x as Pixel, coord.y as Pixel)
    );
  } else if (obj.polyline) {
    transformed.objectType = "polyline";
    transformed.polyline = obj.polyline;
    transformed.polylineVectors = obj.polyline.map((coord: any) => 
      new Vector(coord.x as Pixel, coord.y as Pixel)
    );
  } else if (obj.text) {
    transformed.objectType = "text";
    transformed.text = obj.text;
  } else {
    transformed.objectType = "rectangle";
  }
  
  return transformed;
}

// Vector-based object traversal functions
export function objectsInVectorLayers(
  layers: LayerWithVectors[],
  transform: VectorTiledObjectTransformer = noopVectorTransformer,
): TiledObjectWithVectors[] {
  return layers.flatMap((layer) =>
    objectsInVectorLayer(layer, emptyVectorLayerList, transform),
  );
}

export function objectsInVectorLayer(
  layer: LayerWithVectors,
  ancestry: LayerWithVectors[],
  transform: VectorTiledObjectTransformer,
): TiledObjectWithVectors[] {
  switch (layer.type) {
    case "group": {
      const newAncestry = ancestry.concat(layer);
      return (layer.layers || []).flatMap((subLayer) =>
        objectsInVectorLayer(subLayer, newAncestry, transform),
      );
    }
    case "objectgroup":
      return (layer.objects || []).map((obj) => transform(obj, ancestry));
    default:
      return [];
  }
}

const noopVectorTransformer: VectorTiledObjectTransformer = (obj) => obj;

export type VectorTiledObjectTransformer = (
  obj: TiledObjectWithVectors,
  ancestry: LayerWithVectors[],
) => TiledObjectWithVectors;

const emptyVectorLayerList = Object.freeze([]) as unknown as LayerWithVectors[];