import type { TiledResource } from "@mp/game-shared";
import type { TimeSpan } from "@mp/time";
import { useEffect, useState } from "preact/hooks";
import { ctxEngine } from "./context";
import { ctxGameStateClient } from "./game-state-client";
import { ioc } from "./ioc";

export function GameStateDebugInfo(props: { tiled: TiledResource }) {
  const client = ioc.get(ctxGameStateClient);
  const engine = ioc.get(ctxEngine);
  const [frameInterval, setFrameInterval] = useState<TimeSpan>();
  const [frameDuration, setFrameDuration] = useState<TimeSpan>();

  useEffect(
    () =>
      engine.frameEmitter.subscribe(
        ({ timeSinceLastFrame, previousFrameDuration }) => {
          setFrameInterval(timeSinceLastFrame);
          setFrameDuration(previousFrameDuration);
        },
      ),
    [engine.frameEmitter],
  );

  const tilePos = props.tiled.worldCoordToTile(
    engine.pointer.worldPosition.value,
  );
  const info = {
    viewport: engine.pointer.position.value.toString(),
    world: engine.pointer.worldPosition.value.toString(),
    tile: tilePos.toString(),
    frameInterval: frameInterval?.totalMilliseconds.toFixed(2),
    frameDuration: frameDuration?.totalMilliseconds.toFixed(2),
    frameCallbacks: engine.frameEmitter.callbackCount,
    character: client.character.value?.snapshot(),
  };

  return (
    <pre style={{ overflow: "auto", maxHeight: "70vh" }}>
      {JSON.stringify(info, null, 2)}
    </pre>
  );
}
