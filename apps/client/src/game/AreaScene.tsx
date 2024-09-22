import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useContext, createMemo, For, Show, createEffect } from "solid-js";
import { EngineContext, Pixi, Stage } from "@mp/pixi/solid";
import { api, myCharacter } from "../api";
import { CharacterActor } from "./CharacterActor";
import { TileHighlight } from "./TileHighlight";
import { getTilePosition } from "./getTilePosition";
import { DGraphDebugUI } from "./DGraphDebugUI";

export function AreaScene(props: { area: AreaResource }) {
  const map = () => props.area.tiled.map;
  const engine = useContext(EngineContext);
  const renderer = new TiledRenderer(map);
  const characters = createMemo(() =>
    Array.from(api.state.characters.values()),
  );
  const debugUIActive = createMemo(() => engine.keyboard.isHeld("Shift"));
  const cameraMatrix = createMemo(() =>
    engine.camera.update(myCharacter()?.coords),
  );

  createEffect(() => {
    const { tilePosition, isValidTarget } = getTilePosition(props.area, engine);
    if (engine.pointer.isDown && isValidTarget) {
      throttledMove(tilePosition);
    }
  });

  createEffect(() => {
    const { map } = props.area.tiled;
    engine.camera.resize({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
    });
  });

  createEffect(() => {
    renderer.toggleDebugUI(debugUIActive());
  });

  return (
    <Stage matrix={cameraMatrix}>
      <Pixi instance={renderer} />
      <For each={characters()}>
        {(char) => <CharacterActor char={char} area={props.area} />}
      </For>
      <TileHighlight area={props.area} />
      <Show when={debugUIActive()}>
        <DGraphDebugUI
          area={props.area}
          pathToDraw={() => myCharacter()?.path}
        />
      </Show>
    </Stage>
  );
}

const throttledMove = dedupe(throttle(api.modules.world.move, 100), (a, b) =>
  a.equals(b),
);

function throttle<T extends (...args: never[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last > ms) {
      last = now;
      fn(...args);
    }
  };
}

function dedupe<Input, Output>(
  fn: (input: Input) => Output,
  isEqual: (a: Input, b: Input) => boolean,
): (input: Input) => Output {
  let previous: { input: Input; output: Output } | undefined;
  return (input: Input): Output => {
    if (previous && isEqual(previous.input, input)) {
      return previous.output;
    }
    const output = fn(input);
    previous = { input, output };
    return output;
  };
}
