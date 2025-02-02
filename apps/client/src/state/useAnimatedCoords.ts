import { moveAlongPath } from "@mp/data";
import { EngineContext } from "@mp/engine";
import { vec_distance, type Vector } from "@mp/math";
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
 * Creates a vector signal that lerps each frame along the current path
 */
export function useAnimatedCoords<T extends number>(
  realCoords: Accessor<Vector<T>>,
  destination: Accessor<Vector<T> | undefined>,
  speed: Accessor<NoInfer<T>>,
): Vector<NoInfer<T>> {
  const engine = useContext(EngineContext);
  const animatedCoords = createMutable(realCoords());
  const isMoving = createMemo(() => !!destination());

  createEffect(() => {
    if (isMoving()) {
      onCleanup(engine.addFrameCallback(onFrame));
    }
  });

  function onFrame(deltaTime: TimeSpan) {
    const dest = destination();

    // If the distance between real and animated coords is too large, snap to real coords
    // This may be a bad idea, specially relying on speed as the cutoff, but it may work.
    if (vec_distance(realCoords(), animatedCoords) >= speed()) {
      Object.assign(animatedCoords, realCoords());
    }

    if (dest) {
      moveAlongPath(animatedCoords, [animatedCoords, dest], speed(), deltaTime);
    }
  }

  return animatedCoords;
}
