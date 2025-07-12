import type { TimeSpan } from "@mp/time";
import { createSignal, onMount, onCleanup, batch, createMemo } from "solid-js";
import type { Character, TiledResource } from "../../server";
import { ioc } from "../context";
import { ctxEngine } from "../engine-context";
import { ctxGameStateClient } from "./game-state-client";

export function GameStateDebugInfo(props: { tiled: TiledResource }) {
  const client = ioc.get(ctxGameStateClient);
  const engine = ioc.get(ctxEngine);

  const [frameInterval, setFrameInterval] = createSignal<TimeSpan>();
  const [frameDuration, setFrameDuration] = createSignal<TimeSpan>();

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
    const tilePos = props.tiled.worldCoordToTile(
      engine.pointer.worldPosition.get(),
    );
    return {
      viewport: engine.pointer.position.get(),
      world: engine.pointer.worldPosition.get(),
      tile: tilePos,
      tileSnapped: tilePos.round(),
      cameraTransform: engine.camera.transform.get().data,
      frameInterval: frameInterval()?.totalMilliseconds.toFixed(2),
      frameDuration: frameDuration()?.totalMilliseconds.toFixed(2),
      frameCallbacks: engine.frameEmitter.callbackCount,
      character: trimCharacterInfo(client.character.get()),
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
      ...char.snapshot(),
      coords: char.coords.toString(),
      path: char.path,
    }
  );
}
