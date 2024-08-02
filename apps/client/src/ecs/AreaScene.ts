import type { AreaResource } from "@mp/state";
import type { Character, CharacterId } from "@mp/server";
import type { Engine, Vector, WheelEvent } from "@mp/excalibur";
import { clamp, invoker, Scene, snapTileVector } from "@mp/excalibur";
import { Cleanup, subscribe } from "@mp/events";
import { api } from "../api";
import { Interpolator } from "./Interpolator";
import { CharacterActor } from "./CharacterActor";
import { DGraphDebugUI } from "./DGraphDebugUI";
import { TileHighlight } from "./TileHighlight";

export class AreaScene extends Scene {
  private cleanups = new Cleanup();
  private characterActors: Map<CharacterId, CharacterActor> = new Map();
  private debugUI!: DGraphDebugUI;
  private lastSentPos?: Vector;
  private cameraZoom = 2;

  get myCharacterId() {
    return api.clientId;
  }

  constructor(
    readonly area: AreaResource,
    private renderDebugText: (text: string) => void,
  ) {
    super();

    area.tiled.addToScene(this);

    const tileHighlighter = new TileHighlight(area.dGraph, area.tiled);
    tileHighlighter.z = 999;
    this.add(tileHighlighter);

    this.debugUI = new DGraphDebugUI(
      area.dGraph,
      area.tiled,
      this.renderDebugText,
    );
    this.debugUI.z = 1000;
    this.add(this.debugUI);
  }

  override onActivate(): void {
    const { primary } = this.engine.input.pointers;

    this.cleanups.add(
      api.state.subscribe(this.synchronizeCharacters),
      subscribe(primary, "down", () => (this.shouldSendMove = true)),
      subscribe(primary, "up", () => (this.shouldSendMove = false)),
      subscribe(primary, "wheel", this.onMouseWheel),
    );
  }

  private shouldSendMove = false;

  override onDeactivate(): void {
    this.cleanups.flush();
  }

  private onMouseWheel = (e: WheelEvent) => {
    this.cameraZoom = clamp(this.cameraZoom + Math.sign(e.deltaY) * 0.3, 1, 2);
  };

  override update(engine: Engine, delta: number): void {
    super.update(engine, delta);

    this.camera.zoom = lerp(this.camera.zoom, this.cameraZoom, 0.1);

    if (this.shouldSendMove) {
      const { lastWorldPos } = engine.input.pointers.primary;
      const tilePos = snapTileVector(
        this.area.tiled.worldCoordToTile(lastWorldPos),
      );
      if (!this.lastSentPos || !this.lastSentPos.equals(tilePos)) {
        api.modules.world.move(tilePos);
        this.lastSentPos = tilePos;
      }
    }
  }

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
    entity?.kill();
    this.characterActors.delete(id);
  };

  private upsertCharacterActor(char: Character) {
    if (char.areaId !== this.area.id) {
      this.deleteCharacterActor(char.id);
      return;
    }

    let actor = this.characterActors.get(char.id);
    if (!actor) {
      actor = new CharacterActor(char);
      actor.z = this.area.characterLayer;
      this.add(actor);
      this.characterActors.set(char.id, actor);
      if (char.id === this.myCharacterId) {
        this.camera.strategy.elasticToActor(actor, 0.8, 0.9);
      }
    }

    const pos = this.area.tiled.tileCoordToWorld(char.coords);
    const path = char.path.map(this.area.tiled.tileCoordToWorld);

    invoker(Interpolator, actor).configure(pos, {
      path,
      speed: this.area.tiled.tileUnitToWorld(char.speed),
    });

    if (char.id === this.myCharacterId) {
      this.debugUI.showPath(char.path);
    }
  }

  inheritProperties(other: AreaScene) {
    this.cameraZoom = other.cameraZoom;
    this.camera.zoom = other.camera.zoom;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
