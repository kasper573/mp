import type { TimeSpan } from "@mp/time";
import { createSignal, onMount, onCleanup, batch, createMemo } from "solid-js";
import { useObservable } from "@mp/state/solid";
import type { Character, TiledResource } from "../../server";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { ctxEngine } from "../engine-context";

export function GameStateDebugInfo(props: { tiled: TiledResource }) {
  const client = ioc.get(ctxGameStateClient);
  const engine = ioc.get(ctxEngine);
  const pointerPosition = useObservable(engine.pointer.position);
  const pointerWorldPosition = useObservable(engine.pointer.worldPosition);
  const cameraTransform = useObservable(engine.camera.transform);
  const [frameInterval, setFrameInterval] = createSignal<TimeSpan>();
  const [frameDuration, setFrameDuration] = createSignal<TimeSpan>();

  const character = useObservable(client.character);

  onMount(() =>
    onCleanup(
      engine.frameEmitter.subscribe(
        ({ timeSinceLastFrame, previousFrameDuration }) =>
          batch(() => {
            setFrameInterval(timeSinceLastFrame);
            setFrameDuration(previousFrameDuration);
          }),
      ),
    ),
  );

  const info = createMemo(() => {
    const tilePos = props.tiled.worldCoordToTile(pointerWorldPosition());
    return {
      viewport: pointerPosition(),
      world: pointerWorldPosition(),
      tile: tilePos,
      tileSnapped: tilePos.round(),
      cameraTransform: cameraTransform().data,
      frameInterval: frameInterval()?.totalMilliseconds.toFixed(2),
      frameDuration: frameDuration()?.totalMilliseconds.toFixed(2),
      frameCallbacks: engine.frameEmitter.callbackCount,
      character: trimCharacterInfo(character()),
    };
  });

  return (
    <pre style={{ overflow: "auto", "max-height": "70vh" }}>
      {JSON.stringify(info(), null, 2)}
    </pre>
  );
}

function trimCharacterInfo(char?: Character) {
  return (
    char && {
      ...char,
      coords: char.coords.toString(),
      path: char.path,
    }
  );
}
