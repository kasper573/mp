import { moveAlongPath } from "@mp/data";
import { EngineContext } from "@mp/engine";
import type { Path, Vector } from "@mp/math";
import { vec } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import {
  type Accessor,
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  useContext,
  batch,
} from "solid-js";

/**
 * Creates a vector signal that lerps each frame along the current path
 */
export function useAnimatedCoords(
  getExternal: Accessor<External | undefined>,
): Accessor<Vector | undefined> {
  const engine = useContext(EngineContext);
  const isMoving = createMemo(() => !!getExternal()?.path);
  const externalCoords = createMemo(() => getExternal()?.coords);
  const [getCoords, setCoords] = createSignal(getExternal()?.coords);
  const [getPath, setPath] = createSignal(getExternal()?.path);

  createEffect(() => {
    if (!isMoving()) {
      setCoords(externalCoords());
    }
  });

  createEffect(() => {
    const external = getExternal();
    if (external?.path) {
      setPath(external.path);
    }
  });

  createEffect(() => {
    if (isMoving()) {
      onCleanup(engine.addFrameCallback(onFrame));
    }
  });

  function onFrame(deltaTime: TimeSpan) {
    const path = getPath();
    const external = getExternal();
    const coords = getCoords();
    if (!path || !external || !coords) {
      return;
    }

    const newCoords = vec(coords.x, coords.y);
    const newPath = [...path];
    const { destinationReached } = moveAlongPath(
      newCoords,
      newPath,
      external.speed,
      deltaTime,
    );

    batch(() => {
      setCoords(newCoords);
      setPath(destinationReached ? undefined : newPath);
    });
  }

  return getCoords;
}

type External = {
  coords: Vector;
  path?: Path;
  speed: number;
};
