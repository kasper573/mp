import { EngineContext } from "@mp/engine";
import type { Path, Vector } from "@mp/math";
import { pathCopy } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import {
  type Accessor,
  createEffect,
  onCleanup,
  useContext,
  createMemo,
  batch,
  createSignal,
  untrack,
} from "solid-js";
import { moveAlongPath } from "../../shared/area/move-along-path";

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
  const [localPath, setLocalPath] = createSignal(pathCopy(externalPath()));
  const isMoving = createMemo(() => !!localPath());

  createEffect(() => {
    if (isMoving()) {
      onCleanup(engine.addFrameCallback(onFrame));
    }
  });

  createEffect(() => {
    const newPath = externalPath();
    const currentPath = untrack(localPath);

    // Sometimes when the server sends a "client has stopped moving" state,
    // there is a race condition that can happen where the client side interpolator
    // is not finished interpolating the final segment of the path.
    // if we then trust the server stop message and stop interpolating,
    // the entity will not end up on a full tile and instead stop somewhere in between.
    const problemCanOccurWhen = currentPath?.length === 1 && !newPath?.length;
    if (problemCanOccurWhen) {
      // Just trust that it's okay to ignore the new path and let the local path finish interpolating and then unset itself locally.
      // This may be problematic in the future, because clients could theoretically ignore actual stop signals,
      // ie. certain game mechanics like "stun" or "root" effects that should indeed stun immediately,
      // but this should be fine for now.
    } else {
      setLocalPath(pathCopy(newPath));
    }
  });

  if (snapDistance) {
    createEffect(() => {
      const coords = externalCoords();
      // If the distance between real and animated coords is too large, snap to real coords
      if (coords.distance(localCoords()) >= snapDistance()) {
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
