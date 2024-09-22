import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useContext, createMemo, For, createEffect } from "solid-js";
import { EngineContext, Pixi } from "@mp/pixi/solid";
import { Container, Matrix } from "@mp/pixi";
import { api, myCharacter } from "../api";
import { CharacterActor } from "./CharacterActor";
import { TileHighlight } from "./TileHighlight";
import { getTilePosition } from "./getTilePosition";
import { DGraphDebugUI } from "./DGraphDebugUI";

export function AreaScene(props: { area: AreaResource }) {
  const map = () => props.area.tiled.map;
  const engine = useContext(EngineContext);
  const scene = new Container();
  const renderer = new TiledRenderer(map);
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
    renderer.toggleDebugUI(engine.keyboard.keysHeld.has("Shift"));
  });

  createEffect(() => {
    scene.setFromMatrix(new Matrix(...cameraMatrix().data));
  });

  return (
    <Pixi instance={scene}>
      <Pixi instance={renderer} />
      <For each={Array.from(api.state.characters.values())}>
        {(char) => <CharacterActor char={char} area={props.area} />}
      </For>
      <TileHighlight area={props.area} />
      <DGraphDebugUI area={props.area} pathToDraw={() => myCharacter()?.path} />
    </Pixi>
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
