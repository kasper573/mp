import type { TimeSpan } from "@mp/time";
import { useState, useEffect } from "react";
import type { Character, TiledResource } from "../../server";
import { ioc } from "../context/ioc";
import { ctxEngine } from "../context/common";
import { ctxGameStateClient } from "./game-state-client";

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
    engine.pointer.worldPosition.get(),
  );
  const info = {
    viewport: engine.pointer.position.get(),
    world: engine.pointer.worldPosition.get(),
    tile: tilePos,
    tileSnapped: tilePos.round(),
    cameraTransform: engine.camera.transform.get().data,
    frameInterval: frameInterval?.totalMilliseconds.toFixed(2),
    frameDuration: frameDuration?.totalMilliseconds.toFixed(2),
    frameCallbacks: engine.frameEmitter.callbackCount,
    character: trimCharacterInfo(client.character.get()),
  };

  return (
    <pre style={{ overflow: "auto", maxHeight: "70vh" }}>
      {JSON.stringify(info, null, 2)}
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
