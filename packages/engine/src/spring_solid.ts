import { createEffect, onCleanup, useContext } from "npm:solid-js";
import { EngineContext } from "./context.tsx";
import type { SpringLike } from "./spring.ts";

export function useSpring<T>(spring: SpringLike<T>) {
  const engine = useContext(EngineContext);

  createEffect(() => {
    if (spring.state() === "moving") {
      onCleanup(engine.addFrameCallback(spring.update));
    }
  });

  return spring.value;
}
