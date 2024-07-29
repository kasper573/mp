import { dGraphFromTiled } from "@mp/state";
import {
  type SessionId,
  type Area,
  type Character,
  type AreaMessages,
} from "@mp/server";
import type { Room } from "colyseus.js";
import { invoker, Scene, type DefaultLoader, type Layer } from "@mp/excalibur";
import {
  Cleanup,
  CleanupMap,
  messageSender,
  subscribe,
  type MessageSender,
} from "@mp/events";
import {
  TiledResource,
  type PointerEvent as ExcaliburPointerEvent,
} from "@mp/excalibur";
import { Interpolator } from "./Interpolator";
import { CharacterActor } from "./CharacterActor";
import { DGraphDebugUI } from "./DGraphDebugUI";
import { TileHighlight } from "./TileHighlight";

export class AreaScene extends Scene {
  private cleanups = new Cleanup();
  private characterCleanups = new CleanupMap();
  private characterActors: Map<SessionId, CharacterActor> = new Map();
  private tiled!: TiledResource;
  private bus: MessageSender<AreaMessages>;
  private debugUI!: DGraphDebugUI;
  private characterLayer!: Layer;

  get myCharacterId() {
    return this.room.sessionId;
  }

  constructor(private room: Room<Area>) {
    super();
    this.bus = messageSender(this.room);
  }

  override onPreLoad(loader: DefaultLoader): void {
    this.tiled = new TiledResource("areas/island.tmx");
    loader.addResource(this.tiled);
    loader.areResourcesLoaded().then(this.onTiledLoaded);
  }

  private onTiledLoaded = () => {
    this.tiled.addToScene(this);

    this.characterLayer = this.tiled.getTileLayers("Characters")[0];
    if (!this.characterLayer) {
      throw new Error("Map must contain a characters layer");
    }

    const dGraph = dGraphFromTiled(this.tiled);

    const tileHighlighter = new TileHighlight(dGraph, this.tiled);
    tileHighlighter.z = 999;
    this.add(tileHighlighter);

    this.debugUI = new DGraphDebugUI(dGraph, this.tiled);
    this.debugUI.z = 1000;
    this.add(this.debugUI);
  };

  override onActivate(): void {
    const { characters } = this.room.state;

    this.cleanups.add(
      characters.onAdd(this.addCharacter),
      characters.onRemove(this.deleteCharacter),
      subscribe(this.input.pointers.primary, "down", this.onClick),
    );
  }

  override onDeactivate(): void {
    this.cleanups.flush();
  }

  private onClick = (e: ExcaliburPointerEvent) => {
    const tiledPos = this.tiled.worldCoordToTile(e.worldPos);
    this.bus.send("move", [tiledPos.x, tiledPos.y]);
  };

  private addCharacter = (char: Character) => {
    const actor = new CharacterActor(char);
    actor.z = this.characterLayer.order;
    this.characterActors.set(char.id, actor);
    this.add(actor);

    if (char.id === this.myCharacterId) {
      this.camera.strategy.elasticToActor(actor, 0.8, 0.9);
    }

    this.synchronizeCharacterPosition(char);
    this.characterCleanups.add(
      char.id,
      char.listen("speed", () => this.synchronizeCharacterPosition(char)),
      char.coords.onChange(() => this.synchronizeCharacterPosition(char)),
      char.path.onChange(() => this.synchronizeCharacterPosition(char)),
    );
  };

  private synchronizeCharacterPosition(char: Character) {
    const pos = this.tiled.tileCoordToWorld(char.coords);
    const path = char.path.map(this.tiled.tileCoordToWorld);

    if (char.id === this.myCharacterId) {
      this.debugUI.showPath(char.path.toArray());
    }

    const actor = this.characterActors.get(char.id)!;
    invoker(Interpolator, actor).configure(pos, {
      path,
      speed: this.tiled.tileUnitToWorld(char.speed),
    });
  }

  private deleteCharacter = (_: unknown, id: Character["id"]) => {
    const entity = this.characterActors.get(id);
    entity?.kill();
    this.characterActors.delete(id);
    this.characterCleanups.flush(id);
  };
}
