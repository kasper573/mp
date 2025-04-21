import { createEffect, onCleanup, useContext } from "solid-js";
import { EngineContext } from "./context";
import type { SpringLike } from "./spring";

export function useSpring<T>(spring: SpringLike<T>) {
  const engine = useContext(EngineContext);

  createEffect(() => {
    if (spring.state() === "moving") {
      onCleanup(
        engine.addFrameCallback((opt) => spring.update(opt.timeSinceLastFrame)),
      );
    }
  });

  return spring.value;
}
