import type { Tile } from "@mp/std";
import { addEncoderExtension } from "@mp/encoding";
import type { RectComponents } from "@mp/math";
import { Rect, Vector } from "@mp/math";

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

export const webSocketTokenParam = "token";

export function registerSyncExtensions(): void {
  // All tags below this are reserved by @mp/encoding
  const startTag = 40_501;
  addEncoderExtension<Vector<number>, [number, number]>({
    Class: Vector<number>,
    tag: startTag,
    encode: (v, encode) => encode([v.x, v.y]),
    decode: (v) => new Vector(v[0], v[1]),
  });

  addEncoderExtension<Rect<number>, RectComponents<number>>({
    Class: Rect<number>,
    tag: startTag + 1,
    encode: (v, encode) => encode([v.x, v.y, v.width, v.height]),
    decode: (v) => Rect.fromComponents(...v),
  });
}
