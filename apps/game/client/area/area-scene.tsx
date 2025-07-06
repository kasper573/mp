import { EngineContext, useSpringValue, VectorSpring } from "@mp/engine";
import { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import { type Tile, type Pixel, dedupe, throttle, assert } from "@mp/std";
import type { ParentProps } from "solid-js";
import {
  useContext,
  createMemo,
  createEffect,
  untrack,
  onCleanup,
} from "solid-js";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, LayerViewFactory } from "@mp/tiled-renderer";
import type { ObjectId } from "@mp/tiled-loader";
import { useAtom, useSignalAsAtom, useStorage } from "@mp/state/solid";
import { createReactiveStorage } from "@mp/state";
import { Container, Matrix } from "pixi.js";
import {
  getAreaIdFromObject,
  type AreaResource,
} from "../../shared/area/area-resource";
import { ActorController } from "../actor/actor-controller";
import { GameDebugUiPortal } from "../debug/game-debug-ui-state";
import { clientViewDistance } from "../../server";
import { useSyncEntity } from "../use-sync";
import {
  ReactiveGameStateContext,
  useGameActions,
} from "../game-state/solid-js";
import { reactiveCollectionBinding } from "../reactive-collection";
import { AreaDebugGraphics } from "./area-debug-graphics";
import type { AreaDebugSettings } from "./area-debug-settings-form";
import { AreaDebugForm } from "./area-debug-settings-form";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";
import { RespawnDialog } from "./respawn-dialog";

export function AreaScene(
  props: ParentProps<{
    area: AreaResource;
    spritesheets: TiledSpritesheetRecord;
  }>,
) {
  const engine = useContext(EngineContext);
  const state = useContext(ReactiveGameStateContext);
  const actions = useGameActions();
  const { renderedTileCount } = clientViewDistance;

  const cameraSize = useAtom(engine.camera.cameraSize);
  const pointerWorldPosition = useAtom(engine.pointer.worldPosition);
  const pointerIsDown = useAtom(engine.pointer.isDown);
  const cameraTransform = useAtom(engine.camera.transform);

  const myCoords = () => state().character()?.coords ?? Vector.zero();

  const myWorldPos = createMemo(() =>
    props.area.tiled.tileCoordToWorld(myCoords()),
  );

  const myWorldPosAtom = useSignalAsAtom(() => myWorldPos());

  const cameraPos = useSpringValue(
    new VectorSpring<Pixel>(myWorldPosAtom, () => ({
      stiffness: 80,
      damping: 40,
      mass: 1,
      precision: 0.1,
    })),
  );

  const zoom = createMemo(() =>
    createZoomLevelForViewDistance(
      props.area.tiled.tileSize,
      cameraSize(),
      renderedTileCount,
    ),
  );

  const pointerTile = createMemo(() =>
    props.area.tiled.worldCoordToTile(pointerWorldPosition()),
  );

  const entityAtPointer = createMemo(() =>
    state()
      .actorList()
      .map(useSyncEntity)
      .find(
        (actor) =>
          actor.health > 0 &&
          actor.hitBox.offset(actor.coords).contains(pointerTile()),
      ),
  );

  const highlightTarget = createMemo((): TileHighlightTarget | undefined => {
    const entity = entityAtPointer();
    if (entity) {
      return {
        type: "attack",
        rect: entity.hitBox.offset(entity.coords),
      };
    }

    const tileNode = props.area.graph.getNearestNode(pointerTile());
    if (tileNode) {
      return {
        rect: Rect.fromDiameter(tileNode.data.vector, 1 as Tile),
        type: "move",
      };
    }
  });

  const moveThrottled = dedupe(
    throttle(
      (to: Vector<Tile>, desiredPortalId?: ObjectId) =>
        actions.move(to, desiredPortalId),
      100,
    ),
    ([aVector, aPortalId], [bVector, bPortalId]) =>
      aVector.equals(bVector) && aPortalId === bPortalId,
  );

  createEffect(() => {
    if (pointerIsDown()) {
      const entity = untrack(entityAtPointer);
      if (entity) {
        void actions.attack(entity.id);
      } else {
        const tileNode = props.area.graph.getNearestNode(pointerTile());
        if (tileNode) {
          const portal = props.area
            .hitTestObjects([pointerWorldPosition()])
            .find(getAreaIdFromObject);

          moveThrottled(tileNode.data.vector, portal?.id);
        }
      }
    }
  });

  createEffect(() => {
    engine.camera.update(props.area.tiled.mapSize, zoom(), cameraPos());
  });

  const actors = useSignalAsAtom(() => state().actorList());

  const settingsStorage = createReactiveStorage<AreaDebugSettings>(
    localStorage,
    "area-debug-settings",
    {
      visibleGraphType: "none",
      showFogOfWar: false,
      showAttackRange: false,
      showAggroRange: false,
    },
  );

  const [settings, setSettings] = useStorage(settingsStorage);
  const area = () => props.area;

  const areaScene = new Container({ sortableChildren: true });

  const lookup = createTiledTextureLookup(props.spritesheets);
  const factory = new LayerViewFactory(lookup);
  const tileContainer = factory.createLayerContainer(
    props.area.tiled.map.layers.filter((l) => l.type !== "objectgroup"),
  );

  const dynamicLayerView = assert(
    tileContainer.getChildByLabel(props.area.dynamicLayer.name),
  );

  onCleanup(
    reactiveCollectionBinding(
      dynamicLayerView,
      actors,
      (actor) => new ActorController({ actor, tiled: props.area.tiled }),
    ),
  );

  const areaDebug = new AreaDebugGraphics(area, actors, myCoords, settings);

  areaScene.addChild(tileContainer);
  areaScene.addChild(areaDebug);

  if (engine.isInteractive) {
    const tileHighlight = new TileHighlight(() => ({
      area: props.area,
      target: highlightTarget(),
    }));
    areaScene.addChild(tileHighlight);
  }

  createEffect(() => {
    areaScene.setFromMatrix(new Matrix(...cameraTransform().data));
  });

  return (
    <>
      <Pixi label="AreaScene" as={areaScene}>
        {props.children}
        <GameDebugUiPortal>
          <AreaDebugForm value={settings()} onChange={setSettings} />
        </GameDebugUiPortal>
      </Pixi>

      <RespawnDialog open={(state().character()?.health ?? 0) <= 0} />
    </>
  );
}

function createZoomLevelForViewDistance(
  tileSize: Vector<Pixel>,
  cameraSize: Vector<Pixel>,
  tileViewDistance: Tile,
): number {
  // Never show more tiles than the view distance on any axis
  const numTilesFitInCamera =
    cameraSize.x > cameraSize.y
      ? cameraSize.x / tileSize.x
      : cameraSize.y / tileSize.y;
  return numTilesFitInCamera / tileViewDistance;
}
