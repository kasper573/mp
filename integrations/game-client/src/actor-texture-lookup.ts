import type { ActorModelId } from "@mp/db/types";
import { actorModelStates, type ActorModelState } from "@mp/game-shared";
import type { Size } from "@mp/graphics";
import { Assets, Rectangle, Texture } from "@mp/graphics";
import {
  cardinalDirectionAngles,
  cardinalDirections,
  nearestCardinalDirection,
  type CardinalDirection,
} from "@mp/math";

export type ActorTextureLookup = (
  modelId: ActorModelId,
  state: ActorModelState,
  direction: CardinalDirection,
) => Texture[] | undefined;

/**
 * The URL should be the initial multipack json file
 * https://www.codeandweb.com/texturepacker/tutorials/how-to-create-sprite-sheets-and-animations-with-pixijs#using-multipack-in-pixijs
 *
 * The spritesheet should be an atlas containing individual spritesheets per `ActorAnimationName` according to the following naming convention:
 * <ActorModelId>/<ActorAnimationName>.png
 *
 * Packing settings:
 * - No trimming
 * - Algorithm: Grid / Strip
 * - Multi pack: Supported, so use Auto.
 */
export async function loadActorTextureLookup(
  modelIds: ActorModelId[],
  atlasUrl: string,
): Promise<ActorTextureLookup> {
  await Assets.load(atlasUrl);

  const models = new Map<
    ActorModelId,
    Map<ActorModelState, Map<CardinalDirection, Texture[]>>
  >();
  for (const modelId of modelIds) {
    const texturesPerState = new Map<
      ActorModelState,
      Map<CardinalDirection, Texture[]>
    >();
    for (const state of actorModelStates) {
      const spritesheet = Texture.from(cacheIdForModelState(modelId, state));
      spritesheet.source.scaleMode = "nearest";
      const frameSize: Size = { width: 48, height: 64 }; // TODO Should not be hardcoded
      texturesPerState.set(state, deriveTextures(spritesheet, frameSize));
    }
    models.set(modelId, texturesPerState);
  }

  return (modelId, state, direction) => {
    const texturesPerDirection = models.get(modelId)?.get(state);
    const compatibleDirection = spritesheetCompatibleDirection(
      direction,
      (dir) => texturesPerDirection?.has(dir) ?? false,
    );
    return texturesPerDirection?.get(compatibleDirection);
  };
}

function cacheIdForModelState(
  modelId: ActorModelId,
  state: ActorModelState,
): string {
  return `${modelId}/${state}.png`;
}

/**
 * Since a spritesheet may not contain animations for every direction,
 * we need to provide a fallback direction in case the desired direction
 * is not available.
 */
function spritesheetCompatibleDirection(
  desiredDirection: CardinalDirection,
  hasDirection: (dir: CardinalDirection) => boolean,
): CardinalDirection {
  const availableDirections = cardinalDirections.filter(hasDirection);
  if (availableDirections.includes(desiredDirection)) {
    return desiredDirection;
  }
  const desiredAngle = cardinalDirectionAngles[desiredDirection];
  return nearestCardinalDirection(desiredAngle, availableDirections);
}

function deriveTextures(
  texture: Texture,
  frameSize: Size,
): Map<CardinalDirection, Texture[]> {
  const columns = Math.floor(texture.width / frameSize.width);
  const rows = Math.floor(texture.height / frameSize.height);

  const result = new Map<CardinalDirection, Texture[]>();
  for (let rowIndex = 0; rowIndex < spritesheetRowOrder.length; rowIndex++) {
    if (rowIndex >= rows) {
      break; // Omit directions that are not present in the spritesheet
    }

    const frames: Texture[] = [];
    for (let i = 0; i < columns; i++) {
      frames.push(
        new Texture({
          source: texture.source,
          frame: new Rectangle(
            texture.frame.left + i * frameSize.width,
            texture.frame.top + rowIndex * frameSize.height,
            frameSize.width,
            frameSize.height,
          ),
        }),
      );
    }

    result.set(spritesheetRowOrder[rowIndex], frames);
  }

  return result;
}

/**
 * It is assumed that each spritesheet contains rows in this order where each row animates a specific.
 */
const spritesheetRowOrder: CardinalDirection[] = [
  "s",
  "sw",
  "nw",
  "n",
  "ne",
  "se",
  "e",
  "w",
];
