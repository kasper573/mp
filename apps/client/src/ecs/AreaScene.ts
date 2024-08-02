import type { AreaResource } from "@mp/state";
import type { WorldState } from "@mp/server";
import { type SessionId, type Character, type AreaMessages } from "@mp/server";
import type { Room } from "colyseus.js";
import type { Engine, Vector, WheelEvent } from "@mp/excalibur";
import { clamp, invoker, Scene, snapTileVector } from "@mp/excalibur";
import {
  Cleanup,
  CleanupMap,
  messageSender,
  subscribe,
  type MessageSender,
} from "@mp/events";
import { Interpolator } from "./Interpolator";
import { CharacterActor } from "./CharacterActor";
import { DGraphDebugUI } from "./DGraphDebugUI";
import { TileHighlight } from "./TileHighlight";

export class AreaScene extends Scene {
  private cleanups = new Cleanup();
  private characterActors: Map<SessionId, CharacterActor> = new Map();
  private bus: MessageSender<AreaMessages>;
  private debugUI!: DGraphDebugUI;
  private lastSentPos?: Vector;
  private cameraZoom = 2;

  get myCharacterId() {
    return this.room.sessionId;
  }

  constructor(
    private room: Room<WorldState>,
    readonly area: AreaResource,
    private renderDebugText: (text: string) => void,
  ) {
    super();
    this.bus = messageSender(this.room);

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
    const { characters } = this.room.state;
    const { primary } = this.engine.input.pointers;

    const characterCleanups = new CleanupMap();
    this.cleanups.add(
      characters.onAdd((char: Character) => {
        const sync = () => this.upsertCharacterActor(char);
        sync();
        characterCleanups.add(
          char.id,
          char.listen("areaId", sync),
          char.listen("speed", sync),
          char.coords.onChange(sync),
          char.path.onChange(sync),
        );
      }),
      characters.onRemove((char) => {
        this.deleteCharacterActor(char.id);
        characterCleanups.flush(char.id);
      }),
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
        this.bus.send("move", [tilePos.x, tilePos.y]);
        this.lastSentPos = tilePos;
      }
    }
  }

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
      this.debugUI.showPath(char.path.toArray());
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
