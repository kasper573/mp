import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useContext, createEffect, createMemo, Index } from "solid-js";
import { EngineContext, Pixi } from "@mp/pixi/solid";
import { createQuery } from "@tanstack/solid-query";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { api, myCharacter } from "../api";
import { CharacterActor } from "./CharacterActor";
import { TileHighlight } from "./TileHighlight";
import { getTilePosition } from "./getTilePosition";
import { AreaDebugUI } from "./AreaDebugUI";

export function AreaScene(props: { area: AreaResource }) {
  const engine = useContext(EngineContext);
  const cameraTransform = createMemo(() => {
    const me = myCharacter();
    return engine.camera.update(
      props.area.tiled.mapSize,
      me ? props.area.tiled.tileCoordToWorld(me.coords) : undefined,
    );
  });

  const spritesheets = createQuery(() => ({
    queryKey: ["tiled-spritesheets", props.area.id],
    queryFn: () => loadTiledMapSpritesheets(props.area.tiled.map),
  }));

  createEffect(() => {
    const { tilePosition, isValidTarget } = getTilePosition(props.area, engine);
    if (engine.pointer.isDown && isValidTarget) {
      throttledMove(tilePosition);
    }
  });

  return (
    <Pixi matrix={cameraTransform()}>
      {spritesheets.data && (
        <TiledRenderer
          layers={props.area.tiled.map.layers}
          spritesheets={spritesheets.data}
          debug={engine.keyboard.keysHeld.has("Shift")}
        >
          {{
            [props.area.characterLayer.name]: () => (
              <Index each={Array.from(api.state.characters.values())}>
                {(char) => <CharacterActor char={char} area={props.area} />}
              </Index>
            ),
          }}
        </TiledRenderer>
      )}
      <TileHighlight area={props.area} />
      <AreaDebugUI area={props.area} pathToDraw={myCharacter()?.path} />
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
