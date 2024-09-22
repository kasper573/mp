import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useContext, createMemo, For, Show } from "solid-js";
import { EngineContext, Pixi, Stage } from "@mp/pixi/solid";
import { api, myCharacter } from "../api";
import { CharacterActor } from "./CharacterActor";
import { TileHighlight } from "./TileHighlight";
import { getTilePosition } from "./getTilePosition";
import { effect } from "solid-js/web";
import { DGraphDebugUI } from "./DGraphDebugUI";

export function AreaScene({ area }: { area: AreaResource }) {
  const engine = useContext(EngineContext);
  const renderer = new TiledRenderer(area.tiled.map);
  const debugUIActive = createMemo(() => engine.keyboard.isHeld("Shift"));
  const cameraMatrix = createMemo(() =>
    engine.camera.update(myCharacter()?.coords),
  );

  effect(() => {
    const { tilePosition, isValidTarget } = getTilePosition(area, engine);
    if (engine.pointer.isDown && isValidTarget) {
      throttledMove(tilePosition);
    }
  });

  effect(() => {
    const { map } = area.tiled;
    engine.camera.resize({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
    });
  });

  effect(() => {
    renderer.toggleDebugUI(debugUIActive());
  });

  return (
    <Stage matrix={cameraMatrix}>
      <Pixi instance={renderer} />
      <For each={Array.from(api.state.characters.values())}>
        {(char) => <CharacterActor char={char} area={area} />}
      </For>
      <TileHighlight area={area} />
      <Show when={debugUIActive()}>
        <DGraphDebugUI area={area} pathToDraw={() => myCharacter()?.path} />
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
