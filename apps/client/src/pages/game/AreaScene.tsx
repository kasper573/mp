import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useContext, createEffect, Index, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import { Vector } from "@mp/math";
import { api } from "../../state/api";
import { myCharacter } from "../../state/signals";
import { useAnimatedCoords } from "../../state/useAnimatedCoords";
import { getTilePosition } from "../../state/getTilePosition";
import { dedupe, throttle } from "../../state/functionComposition";
import {
  AutoPositionedCharacterActor,
  ManuallyPositionedCharacterActor,
} from "./CharacterActor";
import { TileHighlight } from "./TileHighlight";
import { AreaDebugUI } from "./AreaDebugUI";

export function AreaScene(props: { area: AreaResource }) {
  const engine = useContext(EngineContext);

  const spritesheets = createQuery(() => ({
    queryKey: ["tiled-spritesheets", props.area.id],
    queryFn: () => loadTiledMapSpritesheets(props.area.tiled.map),
  }));

  const myCoords = useAnimatedCoords(myCharacter);
  const myWorldPos = createMemo(() => {
    const coords = myCoords();
    return coords ? props.area.tiled.tileCoordToWorld(coords) : Vector.zero;
  });
  const cameraPos = useSpring(
    new VectorSpring(myWorldPos, () => ({
      stiffness: 80,
      damping: 40,
      mass: 1,
      precision: 0.1,
    })),
  );

  createEffect(() => {
    const { tilePosition, isValidTarget } = getTilePosition(props.area, engine);
    if (engine.pointer.isDown && isValidTarget) {
      throttledMove(tilePosition);
    }
  });

  createEffect(() => {
    engine.camera.update(props.area.tiled.mapSize, cameraPos());
  });

  return (
    <Pixi
      label="AreaScene"
      sortableChildren
      matrix={engine.camera.transform.data}
    >
      {spritesheets.data && (
        <TiledRenderer
          layers={props.area.tiled.map.layers}
          spritesheets={spritesheets.data}
          debug={engine.keyboard.keysHeld.has("Shift")}
          label={props.area.id}
        >
          {{
            [props.area.characterLayer.name]: () => (
              <Index each={[...api.state.characters.values()]}>
                {(char) => {
                  const isMe = () => char().id === myCharacter()?.id;
                  return (
                    <>
                      <Show when={isMe()}>
                        <ManuallyPositionedCharacterActor
                          tileSize={props.area.tiled.tileSize}
                          position={myWorldPos()}
                        />
                      </Show>
                      <Show when={!isMe()}>
                        <AutoPositionedCharacterActor
                          tiled={props.area.tiled}
                          char={char()}
                        />
                      </Show>
                    </>
                  );
                }}
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
