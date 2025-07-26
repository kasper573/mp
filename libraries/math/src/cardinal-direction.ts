export function nearestCardinalDirection(
  angle: number,
  availableDirections = cardinalDirections,
): CardinalDirection {
  const normalizedAngle = normalizeAngle(angle);
  const nearestDirections = availableDirections.toSorted(
    (directionA, directionB) => {
      const daAngle = normalizeAngle(cardinalDirectionAngles[directionA]);
      const dbAngle = normalizeAngle(cardinalDirectionAngles[directionB]);
      return (
        Math.abs(normalizedAngle - daAngle) -
        Math.abs(normalizedAngle - dbAngle)
      );
    },
  );

  return nearestDirections[0];
}

export type CardinalDirection = keyof typeof cardinalDirectionAngles;

/**
 * The exact angle that each direction represents.
 */
export const cardinalDirectionAngles = {
  e: Math.atan2(0, 1),
  se: Math.atan2(1, 1),
  s: Math.atan2(1, 0),
  sw: Math.atan2(1, -1),
  w: Math.atan2(0, -1),
  nw: Math.atan2(-1, -1),
  n: Math.atan2(-1, 0),
  ne: Math.atan2(-1, 1),
};

export const cardinalDirections = Object.freeze(
  Object.keys(cardinalDirectionAngles),
) as ReadonlyArray<CardinalDirection>;

function normalizeAngle(angle: number) {
  if (angle < 0) {
    return angle + 2 * Math.PI;
  }
  return angle;
}
