import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useComputedValue, useSignalEffect } from "@mp/state";
import { useContext, useEffect } from "react";
import { EngineContext, Pixi, Stage } from "@mp/pixi/react";
import { api, myCharacterId } from "../api";
import { CharacterActor } from "./CharacterActor";
import { TileHighlight } from "./TileHighlight";
import { getTilePosition } from "./getTilePosition";

export function AreaScene({ area }: { area: AreaResource }) {
  const engine = useContext(EngineContext);
  const characters = useComputedValue(() => api.state.value.characters);
  const debugUIActive = useComputedValue(() => engine.keyboard.isHeld("Shift"));
  const me = useComputedValue(() => characters.get(myCharacterId.value!));
  const cameraMatrix = useComputedValue(() => engine.camera.update(me?.coords));

  useSignalEffect(() => {
    const { tilePosition, isValidTarget } = getTilePosition(area, engine);
    if (engine.pointer.isDown.value && isValidTarget) {
      throttledMove(tilePosition);
    }
  });

  useEffect(() => {
    const { map } = area.tiled;
    engine.camera.resize({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
    });
  }, [area, engine]);

  return (
    <Stage matrix={cameraMatrix}>
      <Pixi create={TiledRenderer} map={area.tiled.map} debug={debugUIActive} />
      {Array.from(characters.values()).map((char) => (
        <Pixi
          key={char.id}
          create={CharacterActor}
          engine={engine}
          tileSize={area.tiled.tileSize}
          update={(actor) => {
            actor.interpolator.configure(
              area.tiled.tileCoordToWorld(char.coords),
              {
                path: char.path?.map(area.tiled.tileCoordToWorld) ?? [],
                speed: area.tiled.tileUnitToWorld(char.speed),
              },
            );
          }}
        />
      ))}
      <TileHighlight area={area} />
      {/* 
      {debugUIActive && <DGraphDebugUI area={area} showPath={myChar.path} />} */}
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
