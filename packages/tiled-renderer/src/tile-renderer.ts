import type {
  Texture,
  Matrix,
  FrameObject as RendererFrame,
  Mesh,
  SimpleMeshOptions,
  FrameObject,
} from "@mp/graphics";
import { Container, MeshSimple, Ticker } from "@mp/graphics";
import type { GlobalTileId, Tileset } from "@mp/tiled-loader";
import {
  localToGlobalId,
  type Frame as TiledFrame,
  type TileLayerTile,
} from "@mp/tiled-loader";
import type { TiledTextureLookup } from "./spritesheet";
import { createTileTransform } from "./tile-transform";

/**
 * "dumb" but highly performant renderer that groups tiles by their
 * texture or animation and renders them as a single mesh.
 *
 * Does not handle any sorting, just brute force rendering.
 * Sorting should be handled by the parent container.
 */
export function createTileRenderer(
  tiles: TileLayerTile[],
  lookup: TiledTextureLookup,
): Container {
  const staticGroups = new Map<GlobalTileId, TileRenderData[]>();
  const animations = new Map<AnimationId, RendererFrame[]>();
  const animatedGroups = new Map<AnimationId, TileRenderData[]>();
  for (const layerTile of tiles) {
    const renderData: TileRenderData = {
      width: layerTile.width,
      height: layerTile.height,
      transform: createTileTransform(layerTile),
    };
    if (layerTile.tile.animation) {
      const animationId = getAnimationId(layerTile.tile.animation);
      if (!animations.has(animationId)) {
        animations.set(
          animationId,
          tiledAnimationToRendererFrames(
            layerTile.tile.animation,
            layerTile.tileset,
            lookup,
          ),
        );
      }
      if (animatedGroups.has(animationId)) {
        animatedGroups.get(animationId)?.push(renderData);
      } else {
        animatedGroups.set(animationId, [renderData]);
      }
      upsertMap(animatedGroups, animationId, renderData);
    } else {
      upsertMap(staticGroups, layerTile.id, renderData);
    }
  }

  const tileMap = new Container({ isRenderGroup: true });

  for (const [textureTileId, renderData] of staticGroups) {
    const texture = lookup.texture(textureTileId);
    tileMap.addChild(createStaticTileRenderer(texture, renderData));
  }

  for (const [animationId, renderData] of animatedGroups) {
    const frames = animations.get(animationId);
    if (frames) {
      tileMap.addChild(createAnimatedTileRenderer(frames, renderData));
    }
  }

  return tileMap;
}

function createStaticTileRenderer(
  texture: Texture,
  tiles: TileRenderData[],
): Container {
  return new MeshSimple({ texture, ...createMeshInput(tiles) });
}

function createAnimatedTileRenderer(
  frames: FrameObject[],
  tiles: TileRenderData[],
): Mesh {
  return new AnimatedMesh(frames, createMeshInput(tiles));
}

class AnimatedMesh extends MeshSimple {
  private frameIndex = 0;
  private elapsed = 0;

  constructor(
    private frames: FrameObject[],
    options: Omit<SimpleMeshOptions, "texture">,
  ) {
    super({ texture: frames[0].texture, ...options });
    this.onRender = this.#onRender;
  }

  #onRender = (): void => {
    this.elapsed += Ticker.shared.deltaMS;

    const frameObj = this.frames[this.frameIndex];
    if (this.elapsed >= frameObj.time) {
      this.elapsed -= frameObj.time;
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.texture = this.frames[this.frameIndex].texture;
    }
  };
}

interface TileRenderData {
  width: number;
  height: number;
  transform: Matrix;
}

function createMeshInput(tiles: TileRenderData[]) {
  const N = tiles.length;

  // 4 verts per tile, 2 components (x,y) each
  const vertices = new Float32Array(N * 4 * 2);
  // same size for UVs
  const uvs = new Float32Array(N * 4 * 2);
  // 6 indices per quad
  const indices = new Uint32Array(N * 6);

  // Normalized UV pattern for a full-texture quad
  const uvPattern = [0, 0, 1, 0, 1, 1, 0, 1];

  for (let i = 0; i < N; i++) {
    const { width, height, transform } = tiles[i];
    const { a, b, c, d, tx, ty } = transform;

    // Transform the four corners of a rectangle [0,0]→[width,height]
    const vOff = i * 8;
    vertices[vOff] = tx; // x0
    vertices[vOff + 1] = ty; // y0
    vertices[vOff + 2] = a * width + tx; // x1
    vertices[vOff + 3] = b * width + ty; // y1
    vertices[vOff + 4] = a * width + c * height + tx; // x2
    vertices[vOff + 5] = b * width + d * height + ty; // y2
    vertices[vOff + 6] = c * height + tx; // x3
    vertices[vOff + 7] = d * height + ty; // y3

    // copy the same normalized UVs for each tile
    uvs.set(uvPattern, vOff);

    const iOff = i * 6;
    const base = i * 4;
    // two triangles: (0,1,2) and (0,2,3)
    indices[iOff] = base;
    indices[iOff + 1] = base + 1;
    indices[iOff + 2] = base + 2;
    indices[iOff + 3] = base;
    indices[iOff + 4] = base + 2;
    indices[iOff + 5] = base + 3;
  }

  return { vertices, uvs, indices };
}

function upsertMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  if (map.has(key)) {
    map.get(key)?.push(value);
  } else {
    map.set(key, [value]);
  }
}

function tiledAnimationToRendererFrames(
  animation: TiledFrame[],
  tileset: Tileset,
  lookup: TiledTextureLookup,
): RendererFrame[] {
  return animation.map(
    (f): RendererFrame => ({
      time: f.duration,
      texture: lookup.texture(localToGlobalId(tileset.firstgid, f.tileid)),
    }),
  );
}

type AnimationId = string;

function getAnimationId(frames: TiledFrame[]): AnimationId {
  // This is safe to do since a frame is just a texture id and a duration.
  // It gives us a unique identifier for an animation. It's quick and dirty but works well for our purposes.
  return JSON.stringify(frames);
}
