import { moveAlongPath } from "@mp/data";
import { EngineContext } from "@mp/engine";
import type { Path } from "@mp/math";
import { path_copy, vec_distance, type Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import {
  type Accessor,
  createEffect,
  onCleanup,
  useContext,
  createMemo,
  batch,
  createSignal,
} from "solid-js";

/**
 * Creates a vector signal that lerps each frame along the current path.
 * Will synchronize external coords and path if they change.
 */
export function useAnimatedCoords<T extends number>(
  externalCoords: Accessor<Vector<T>>,
  externalPath: Accessor<Path<T> | undefined>,
  speed: Accessor<NoInfer<T>>,
  snapDistance?: Accessor<NoInfer<T>>,
): Accessor<Vector<NoInfer<T>>> {
  const engine = useContext(EngineContext);
  const [localCoords, setLocalCoords] = createSignal(externalCoords());
  const [localPath, setLocalPath] = createSignal(path_copy(externalPath()));
  const isMoving = createMemo(() => !!localPath());

  createEffect(() => {
    if (isMoving()) {
      onCleanup(engine.addFrameCallback(onFrame));
    }
  });

  createEffect(() => setLocalPath(path_copy(externalPath())));

  if (snapDistance) {
    createEffect(() => {
      const coords = externalCoords();
      // If the distance between real and animated coords is too large, snap to real coords
      if (vec_distance(coords, localCoords()) >= snapDistance()) {
        setLocalCoords(coords);
      }
    });
  }

  function onFrame(deltaTime: TimeSpan) {
    const path = localPath();
    if (path) {
      const [newCoords, newPath] = moveAlongPath(
        localCoords(),
        path,
        speed(),
        deltaTime,
      );
      batch(() => {
        setLocalCoords(newCoords);
        setLocalPath(newPath.length > 0 ? newPath : undefined);
      });
    }
  }

  return localCoords;
}
