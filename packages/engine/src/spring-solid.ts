import { createEffect, onCleanup, useContext } from "solid-js";
import { useAtom } from "@mp/state/solid";
import { EngineContext } from "./context";
import type { SpringLike } from "./spring";
import type { FrameEmitter } from "./frame-emitter";

export function useSpringValue<T>(
  spring: SpringLike<T>,
  frameEmitter: FrameEmitter = useContext(EngineContext).frameEmitter,
) {
  const value = useAtom(spring.value);
  const state = useAtom(spring.state);

  createEffect(() => {
    if (state() === "moving") {
      onCleanup(
        frameEmitter.subscribe((opt) => spring.update(opt.timeSinceLastFrame)),
      );
    }
  });

  return value;
}
