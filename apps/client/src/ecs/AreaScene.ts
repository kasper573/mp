import { dNodeFromVector, type AreaResource } from "@mp/state";
import { clamp } from "@mp/math";
import type { Character, CharacterId } from "@mp/server";
import { Cleanup, Container, sub } from "@mp/pixi";
import { snapTileVector } from "@mp/state";
import type { Vector } from "@mp/math";
import { TiledRenderer } from "@mp/tiled-renderer";
import { api } from "../api";
import { CharacterActor } from "./CharacterActor";
import { DGraphDebugUI } from "./DGraphDebugUI";
import { TileHighlight } from "./TileHighlight";
import { Engine } from "./Engine";

export class AreaScene extends Container {
  private cleanups = new Cleanup();
  private characterActors: Map<CharacterId, CharacterActor> = new Map();
  private debugUI!: DGraphDebugUI;
  private lastSentPos?: Vector;
  private cameraZoom = 2;

  get myCharacterId() {
    return api.clientId;
  }

  constructor(
    private readonly area: AreaResource,
    private renderDebugText: (text: string) => void,
  ) {
    super();

    this.addChild(new TiledRenderer(area.tiled.map));

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
      sub(this, "mousedown", () => (this.isMouseDown = true)),
      sub(this, "mouseup", () => (this.isMouseDown = false)),
      sub(this, "wheel", this.onMouseWheel),
    );
  };

  private isMouseDown = false;

  deactivate = () => {
    this.cleanups.flush();
  };

  private onMouseWheel = (e: WheelEvent) => {
    this.cameraZoom = clamp(this.cameraZoom + Math.sign(e.deltaY) * 0.3, 1, 2);
  };

  override _onRender = () => {
    // TODO this.camera.zoom = lerp(this.camera.zoom, this.cameraZoom, 0.1);

    if (!this.isMouseDown) {
      return;
    }

    const { lastWorldPos } = Engine.instance.input.pointer;
    const tilePos = snapTileVector(
      this.area.tiled.worldCoordToTile(lastWorldPos),
    );

    const isValidTarget = !!this.area.dGraph[dNodeFromVector(tilePos)];
    if (!isValidTarget) {
      return;
    }

    if (!this.lastSentPos || !this.lastSentPos.equals(tilePos)) {
      api.modules.world.move(tilePos);
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
      this.removeChild(entity);
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
      actor = new CharacterActor(char, this.area.tiled.tileSize);
      actor.zIndex = this.area.characterLayer;
      this.addChild(actor);
      this.characterActors.set(char.id, actor);
      if (char.id === this.myCharacterId) {
        // TODO this.camera.strategy.elasticToActor(actor, 0.8, 0.9);
      }
    }

    const pos = this.area.tiled.tileCoordToWorld(char.coords);
    const path = char.path.map(this.area.tiled.tileCoordToWorld);

    actor.interpolator.configure(pos, {
      path,
      speed: this.area.tiled.tileUnitToWorld(char.speed),
    });

    if (char.id === this.myCharacterId) {
      this.debugUI.showPath(char.path);
    }
  }

  inheritProperties(other: AreaScene) {
    this.cameraZoom = other.cameraZoom;
    // TODO this.camera.zoom = other.camera.zoom;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
