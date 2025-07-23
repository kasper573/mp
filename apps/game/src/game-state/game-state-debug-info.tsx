import type { TimeSpan } from "@mp/time";
import { useState, useEffect } from "preact/hooks";
import { ioc } from "../context/ioc";
import { ctxEngine } from "../context/common";
import { ctxGameStateClient } from "./game-state-client";
import type { TiledResource } from "../area/tiled-resource";

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
    character: client.character.value,
  };

  return (
    <pre style={{ overflow: "auto", maxHeight: "70vh" }}>
      {JSON.stringify(info, null, 2)}
    </pre>
  );
}
