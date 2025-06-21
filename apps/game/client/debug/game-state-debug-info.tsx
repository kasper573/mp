import { EngineContext } from "@mp/engine";
import type { TimeSpan } from "@mp/time";
import {
  useContext,
  createSignal,
  onMount,
  onCleanup,
  batch,
  createMemo,
} from "solid-js";
import type { Character, TiledResource } from "../../server";
import { GameStateClientContext } from "../game-state-client";

export function GameStateDebugInfo(props: { tiled: TiledResource }) {
  const state = useContext(GameStateClientContext);
  const engine = useContext(EngineContext);

  const [frameInterval, setFrameInterval] = createSignal<TimeSpan>();
  const [frameDuration, setFrameDuration] = createSignal<TimeSpan>();

  onMount(() =>
    onCleanup(
      engine.addFrameCallback(({ timeSinceLastFrame, previousFrameDuration }) =>
        batch(() => {
          setFrameInterval(timeSinceLastFrame);
          setFrameDuration(previousFrameDuration);
        }),
      ),
    ),
  );

  const info = createMemo(() => {
    const { worldPosition, position: viewportPosition } = engine.pointer;
    const tilePos = props.tiled.worldCoordToTile(worldPosition);
    return {
      viewport: viewportPosition,
      world: worldPosition,
      tile: tilePos,
      tileSnapped: tilePos.round(),
      cameraTransform: engine.camera.transform.data,
      frameInterval: frameInterval()?.totalMilliseconds.toFixed(2),
      frameDuration: frameDuration()?.totalMilliseconds.toFixed(2),
      frameCallbacks: engine.frameCallbackCount,
      character: trimCharacterInfo(state().character()),
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
