import { moveAlongPath } from "@mp/data";
import { EngineContext } from "@mp/engine";
import type { Path } from "@mp/math";
import { Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import {
  type Accessor,
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  useContext,
} from "solid-js";

/**
 * Creates a vector signal that lerps each frame along the current path
 */
export function useAnimatedCoords(
  input: Accessor<Config | undefined>,
): Accessor<Vector | undefined> {
  const engine = useContext(EngineContext);
  const [config, setConfig] = createSignal<Config | undefined>(input());
  const isMoving = createMemo(() => !!config()?.path);

  createEffect(() => setConfig(input()));

  createEffect(() => {
    if (isMoving()) {
      onCleanup(engine.addFrameCallback(onFrame));
    }
  });

  function onFrame(deltaTime: TimeSpan) {
    const c = config();
    if (!c?.path) {
      return;
    }

    const { coords, path, speed } = c;

    const newCoords = new Vector(coords.x, coords.y);
    const newPath = [...path];
    const { destinationReached } = moveAlongPath(
      newCoords,
      newPath,
      speed,
      deltaTime,
    );

    setConfig({
      coords: newCoords,
      path: destinationReached ? undefined : newPath,
      speed,
    });
  }

  const coords = createMemo(() => config()?.coords);

  return coords;
}

type Config = {
  coords: Vector;
  path?: Path;
  speed: number;
};
