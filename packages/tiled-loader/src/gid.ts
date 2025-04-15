import type { GlobalTileId, LocalTileId } from "./schema/common";

export function readGlobalIdBuffer(
  buffer: Uint8Array,
  offset: number,
): {
  gid: GlobalTileId;
  newOffset: number;
  flags: GlobalIdFlags;
} {
  // Read the GID in little-endian byte order:
  let i =
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24);

  // Read out the flags
  const flippedHorizontally = (i & flippedHorizontallyFlag) !== 0;
  const flippedVertically = (i & flippedVerticallyFlag) !== 0;
  const flippedDiagonally = (i & flippedDiagonallyFlag) !== 0;
  const rotatedHexagonal120 = (i & rotatedHexagonal120Flag) !== 0;

  // Clear all four flags
  i &= ~(
    flippedHorizontallyFlag |
    flippedVerticallyFlag |
    flippedDiagonallyFlag |
    rotatedHexagonal120Flag
  );

  return {
    gid: i as GlobalTileId,
    newOffset: offset + 4,
    flags: {
      flippedHorizontally,
      flippedVertically,
      flippedDiagonally,
      rotatedHexagonal120,
    },
  };
}

export interface GlobalIdFlags {
  flippedHorizontally: boolean;
  flippedVertically: boolean;
  flippedDiagonally: boolean;
  rotatedHexagonal120: boolean;
}

export function localToGlobalId(
  tilesetFirstGID: GlobalTileId,
  localId: LocalTileId,
): GlobalTileId {
  return (tilesetFirstGID + localId) as GlobalTileId;
}

export function globalToLocalId(
  tilesetFirstGID: GlobalTileId,
  globalId: GlobalTileId,
): LocalTileId {
  return (globalId - tilesetFirstGID) as LocalTileId;
}

const flippedHorizontallyFlag = 0x80_00_00_00;
const flippedVerticallyFlag = 0x40_00_00_00;
const flippedDiagonallyFlag = 0x20_00_00_00;
const rotatedHexagonal120Flag = 0x10_00_00_00;
