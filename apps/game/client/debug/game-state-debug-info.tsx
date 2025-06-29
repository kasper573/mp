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
import { useAtom } from "@mp/state/solid";
import type { Character, TiledResource } from "../../server";
import { ReactiveGameStateContext } from "../game-state/solid-js";

export function GameStateDebugInfo(props: { tiled: TiledResource }) {
  const gameState = useContext(ReactiveGameStateContext);
  const engine = useContext(EngineContext);
  const pointerPosition = useAtom(engine.pointer.position);
  const pointerWorldPosition = useAtom(engine.pointer.worldPosition);
  const cameraTransform = useAtom(engine.camera.transform);
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
      character: trimCharacterInfo(gameState().character()),
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
