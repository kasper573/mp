import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import type { Accessor } from "solid-js";
import { useContext, createEffect, Index } from "solid-js";
import { EngineContext, Pixi } from "@mp/pixi/solid";
import { Container, Matrix } from "@mp/pixi";
import { api, myCharacter } from "../api";
import { CharacterActor } from "./CharacterActor";
import { TileHighlight } from "./TileHighlight";
import { getTilePosition } from "./getTilePosition";
import { AreaDebugUI } from "./AreaDebugUI";

export function AreaScene(props: { area: Accessor<AreaResource> }) {
  const tiledMap = () => props.area().tiled.map;
  const engine = useContext(EngineContext);
  const scene = new Container();
  const characterContainer = new Container();
  const renderer = new TiledRenderer(tiledMap);
  renderer.addChild(characterContainer);

  createEffect(() => {
    characterContainer.zIndex = props.area().characterLayerIndex;
  });

  createEffect(() => {
    const { tilePosition, isValidTarget } = getTilePosition(
      props.area(),
      engine,
    );
    if (engine.pointer.isDown && isValidTarget) {
      throttledMove(tilePosition);
    }
  });

  createEffect(() => {
    renderer.toggleDebugUI(engine.keyboard.keysHeld.has("Shift"));
  });

  createEffect(() => {
    const me = myCharacter();
    const cameraTransform = engine.camera.update(
      props.area().tiled.mapSize,
      me ? props.area().tiled.tileCoordToWorld(me.coords) : undefined,
    );
    scene.setFromMatrix(new Matrix(...cameraTransform.data));
  });

  return (
    <Pixi instance={scene}>
      <Pixi instance={renderer} />
      <Pixi instance={characterContainer}>
        <Index each={Array.from(api.state.characters.values())}>
          {(char) => <CharacterActor char={char} area={props.area()} />}
        </Index>
      </Pixi>
      <TileHighlight area={props.area()} />
      <AreaDebugUI area={props.area()} pathToDraw={() => myCharacter()?.path} />
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
