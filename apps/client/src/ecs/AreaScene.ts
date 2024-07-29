import { tiledDGraph } from "@mp/state";
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
import { Movement } from "./Movement";
import { CharacterActor } from "./CharacterActor";
import { AreaDebugUI } from "./AreaDebugUI";
import { TileHighlighter } from "./TileHighlighter";

export class AreaScene extends Scene {
  private cleanups = new Cleanup();
  private characterCleanups = new CleanupMap();
  private characterActors: Map<SessionId, CharacterActor> = new Map();
  private tileMap!: TiledResource;
  private bus: MessageSender<AreaMessages>;
  private debugUI!: AreaDebugUI;
  private tileHighlighter!: TileHighlighter;
  private characterLayer!: Layer;

  get myCharacterId() {
    return this.room.sessionId;
  }

  constructor(private room: Room<Area>) {
    super();
    this.bus = messageSender(this.room);
  }

  override onPreLoad(loader: DefaultLoader): void {
    this.tileMap = new TiledResource("areas/island.tmx");
    loader.addResource(this.tileMap);
    loader.areResourcesLoaded().then(this.onTileMapLoaded);
  }

  private onTileMapLoaded = () => {
    this.tileMap.addToScene(this);

    this.characterLayer = this.tileMap.getTileLayers("Characters")[0];
    if (!this.characterLayer) {
      throw new Error("Map must contain a characters layer");
    }

    const dGraph = tiledDGraph(this.tileMap);

    this.debugUI = new AreaDebugUI(dGraph, this.tileMap);
    this.debugUI.z = 1000;
    this.add(this.debugUI);

    this.tileHighlighter = new TileHighlighter(dGraph, this.tileMap);
    this.tileHighlighter.z = 999;
    this.add(this.tileHighlighter);
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
    const tiledPos = this.tileMap.worldCoordToTile(e.worldPos);
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
    const pos = this.tileMap.tileCoordToWorld(char.coords);
    const path = char.path.map(this.tileMap.tileCoordToWorld);

    if (char.id === this.myCharacterId) {
      this.debugUI.showPath(char.path.toArray());
    }

    const actor = this.characterActors.get(char.id)!;
    invoker(Movement, actor).sync(pos, {
      path,
      speed: this.tileMap.tileUnitToWorld(char.speed),
    });
  }

  private deleteCharacter = (_: unknown, id: Character["id"]) => {
    const entity = this.characterActors.get(id);
    entity?.kill();
    this.characterActors.delete(id);
    this.characterCleanups.flush(id);
  };
}
