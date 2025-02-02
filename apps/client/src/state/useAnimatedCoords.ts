import { moveAlongPath } from "@mp/data";
import { EngineContext } from "@mp/engine";
import type { Path } from "@mp/math";
import { vec_copy, vec_distance, type Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import {
  type Accessor,
  createEffect,
  onCleanup,
  useContext,
  createMemo,
} from "solid-js";
import { createMutable } from "solid-js/store";

/**
 * Creates a vector signal that lerps each frame along the current path.
 * Will synchronize external coords and path if they change.
 */
export function useAnimatedCoords<T extends number>(
  externalCoords: Accessor<Vector<T>>,
  externalPath: Accessor<Path<T> | undefined>,
  speed: Accessor<NoInfer<T>>,
  snapDistance?: Accessor<NoInfer<T>>,
): Vector<NoInfer<T>> {
  const engine = useContext(EngineContext);
  const local = createMutable({
    coords: vec_copy(externalCoords()),
    path: externalPath()?.map(vec_copy),
  });
  const isMoving = createMemo(() => !!local.path);

  createEffect(() => {
    if (isMoving()) {
      onCleanup(engine.addFrameCallback(onFrame));
    }
  });

  createEffect(() => {
    // eslint-disable-next-line solid/reactivity
    local.path = externalPath()?.map(vec_copy);
  });

  if (snapDistance) {
    createEffect(() => {
      const coords = externalCoords();
      // If the distance between real and animated coords is too large, snap to real coords
      if (vec_distance(coords, local.coords) >= snapDistance()) {
        Object.assign(local.coords, coords);
      }
    });
  }

  function onFrame(deltaTime: TimeSpan) {
    if (local.path) {
      moveAlongPath(local.coords, local.path, speed(), deltaTime);
      if (local.path.length === 0) {
        delete local.path;
      }
    }
  }

  // eslint-disable-next-line solid/reactivity
  return local.coords;
}
