import type { Tile } from "@mp/std";
import { addEncoderExtensionToSync } from "@mp/sync";
import { Vector } from "@mp/math";

// This file should only expose runtime code that is shared between client/server.

// This should end up being primarily constants and utility functions.

/**
 * Diameter in tiles around the player that determines what a player can see and the zoom level of the camera.
 * We have one number for rendering and one for networking to allow for some margin
 * in the renderer so that objects don't pop in and out of view.
 */
export const clientViewDistance = {
  renderedTileCount: 24 as Tile,
  networkFogOfWarTileCount: 32 as Tile,
};

export function registerSyncExtensions(): void {
  // All tags below this are reserved by cbor-x
  const startTag = 40_501;
  addEncoderExtensionToSync<Vector<number>, [number, number]>({
    Class: Vector<number>,
    tag: startTag,
    encode: (v, encode) => encode([v.x, v.y]),
    decode: (v) => new Vector(v[0], v[1]),
  });
}
