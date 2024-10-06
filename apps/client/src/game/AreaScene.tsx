import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useContext, createEffect, Index, createMemo, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext } from "@mp/engine";
import { api } from "../state/api";
import { myCharacter } from "../state/signals";
import {
  AutoPositionedCharacterActor,
  ManuallyPositionedCharacterActor,
} from "./CharacterActor";
import { useAnimatedCoords } from "./useAnimatedCoords";
import { TileHighlight } from "./TileHighlight";
import { getTilePosition } from "./getTilePosition";
import { AreaDebugUI } from "./AreaDebugUI";
import { dedupe, throttle } from "./functionComposition";

export function AreaScene(props: { area: AreaResource }) {
  const engine = useContext(EngineContext);

  const spritesheets = createQuery(() => ({
    queryKey: ["tiled-spritesheets", props.area.id],
    queryFn: () => loadTiledMapSpritesheets(props.area.tiled.map),
  }));

  const myCoords = useAnimatedCoords(myCharacter);
  const myWorldPos = createMemo(() => {
    const coords = myCoords();
    return coords ? props.area.tiled.tileCoordToWorld(coords) : undefined;
  });

  createEffect(() => {
    const { tilePosition, isValidTarget } = getTilePosition(props.area, engine);
    if (engine.pointer.isDown && isValidTarget) {
      throttledMove(tilePosition);
    }
  });

  createEffect(() => {
    engine.camera.update(props.area.tiled.mapSize, myWorldPos());
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
              <Index each={Array.from(api.state.characters.values())}>
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
