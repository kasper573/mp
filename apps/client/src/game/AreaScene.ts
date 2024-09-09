import { dNodeFromVector, type AreaResource } from "@mp/state";
import type { Character, CharacterId } from "@mp/server";
import { Cleanup, Container, Matrix } from "@mp/pixi";
import { snapTileVector } from "@mp/state";
import type { Vector } from "@mp/math";
import { TiledRenderer } from "@mp/tiled-renderer";
import { Engine } from "@mp/pixi";
import { api, getMyFakeCharacterId } from "../api";
import { CharacterActor } from "./CharacterActor";
import { DGraphDebugUI } from "./DGraphDebugUI";
import { TileHighlight } from "./TileHighlight";

const throttledMove = throttle(api.modules.world.move, 100);

export class AreaScene extends Container {
  private cleanups = new Cleanup();
  private tiledRenderer: TiledRenderer;
  private characterActors: Map<CharacterId, CharacterActor> = new Map();
  private characterContainer = new Container();
  private debugUI!: DGraphDebugUI;
  private lastSentPos?: Vector;

  get myCharacterId() {
    return getMyFakeCharacterId();
  }

  constructor(
    private readonly area: AreaResource,
    private renderDebugText: (text: string) => void,
  ) {
    super({ interactive: true });

    this.tiledRenderer = new TiledRenderer(area.tiled.map);
    this.addChild(this.tiledRenderer);

    this.characterContainer.zIndex = area.characterLayerIndex;
    this.tiledRenderer.addChild(this.characterContainer);

    const tileHighlighter = new TileHighlight(area.dGraph, area.tiled);
    tileHighlighter.zIndex = 999;
    this.addChild(tileHighlighter);

    this.debugUI = new DGraphDebugUI(
      area.dGraph,
      area.tiled,
      this.renderDebugText,
    );
    this.debugUI.zIndex = 1000;
    this.addChild(this.debugUI);

    this.on("added", this.activate);
    this.on("removed", this.deactivate);
  }

  activate = () => {
    this.cleanups.add(
      api.state.subscribe(this.synchronizeCharacters),
      Engine.instance.input.keyboard.subscribe(
        "Shift",
        this.tiledRenderer.toggleDebugUI,
      ),
    );
  };

  deactivate = () => {
    this.cleanups.flush();
  };

  override _onRender = () => {
    if (!Engine.instance.input.pointer.isDown) {
      return;
    }

    const { lastWorldPosition } = Engine.instance.input.pointer;
    const tilePos = snapTileVector(
      this.area.tiled.worldCoordToTile(lastWorldPosition),
    );

    const isValidTarget = !!this.area.dGraph[dNodeFromVector(tilePos)];
    if (!isValidTarget) {
      return;
    }

    if (!this.lastSentPos || !this.lastSentPos.equals(tilePos)) {
      void throttledMove(tilePos);
      this.lastSentPos = tilePos;
    }
  };

  private synchronizeCharacters = () => {
    const { characters } = api.state.value;
    const removed = new Set(this.characterActors.keys()).difference(
      new Set(characters.keys()),
    );
    removed.forEach(this.deleteCharacterActor);
    const addedOrUpdated = new Set(characters.keys()).difference(removed);
    for (const id of addedOrUpdated) {
      this.upsertCharacterActor(characters.get(id)!);
    }
  };

  private deleteCharacterActor = (id: Character["id"]) => {
    const entity = this.characterActors.get(id);
    if (entity) {
      this.characterContainer.removeChild(entity);
      this.characterActors.delete(id);
    }
  };

  private upsertCharacterActor(char: Character) {
    if (char.areaId !== this.area.id) {
      this.deleteCharacterActor(char.id);
      return;
    }

    let actor = this.characterActors.get(char.id);
    if (!actor) {
      actor = new CharacterActor(this.area.tiled.tileSize);
      this.characterContainer.addChild(actor);
      this.characterActors.set(char.id, actor);
    }

    const pos = this.area.tiled.tileCoordToWorld(char.coords);
    const path = char.path?.map(this.area.tiled.tileCoordToWorld) ?? [];

    if (char.id === this.myCharacterId) {
      Engine.instance.camera.update(this.tiledRenderer, pos);

      this.setFromMatrix(new Matrix(...Engine.instance.camera.transform.data));
    }

    actor.interpolator.configure(pos, {
      path,
      speed: this.area.tiled.tileUnitToWorld(char.speed),
    });

    if (char.path && char.id === this.myCharacterId) {
      this.debugUI.showPath(char.path);
    }
  }
}

// TODO this should probably be centralized/generalized inside the network client if done more than just here
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