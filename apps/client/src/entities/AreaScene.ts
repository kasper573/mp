import { tiledDGraph } from "@mp/state";
import {
  type SessionId,
  type Area,
  type Character,
  type AreaMessages,
} from "@mp/server";
import type { Room } from "colyseus.js";
import { Scene, type DefaultLoader, type Layer } from "@mp/excalibur";
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
import { CharacterActor } from "./CharacterActor";
import { AreaDebugUI } from "./AreaDebugUI";
import { AreaTileHighlighter } from "./AreaTileHighlighter";

export class AreaScene extends Scene {
  private cleanups = new Cleanup();
  private characterCleanups = new CleanupMap();
  private characterActors: Map<SessionId, CharacterActor> = new Map();
  private tileMap!: TiledResource;
  private bus: MessageSender<AreaMessages>;
  private debugUI!: AreaDebugUI;
  private tileHighlighter!: AreaTileHighlighter;
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

    this.debugUI = new AreaDebugUI(dGraph, this.tileMap.map);
    this.debugUI.z = 1000;
    this.add(this.debugUI);

    this.tileHighlighter = new AreaTileHighlighter(dGraph, this.tileMap.map);
    this.tileHighlighter.z = 999;
    this.add(this.tileHighlighter);
  };

  override onActivate(): void {
    const { characters } = this.room.state;

    this.cleanups.add(
      characters.onAdd(this.addCharacter),
      characters.onRemove(this.deleteCharacter),
      subscribe(this.input.pointers.primary, "down", this.onPointerClick),
      subscribe(this.input.pointers.primary, "move", this.onPointerMove),
    );
  }

  override onDeactivate(): void {
    this.cleanups.flush();
  }

  private onPointerMove = (e: ExcaliburPointerEvent) => {
    this.tileHighlighter.setHighlighted(
      this.tileMap.worldCoordToTile(e.worldPos),
    );
  };

  private onPointerClick = (e: ExcaliburPointerEvent) => {
    const tiledPos = this.tileMap.worldCoordToTile(e.worldPos);

    if (!tiledPos) {
      console.warn("Could not translate pointer position to tile coordinate");
      return;
    }

    const { ctrlKey } = e.nativeEvent as PointerEvent;
    if (ctrlKey) {
      this.debugUI.toggleNode(tiledPos);
    } else {
      this.bus.send("move", [tiledPos.x, tiledPos.y]);
    }
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
      char.coords.onChange(() => this.synchronizeCharacterPosition(char)),
      char.lastPath.onChange(() =>
        this.debugUI.setPath(char.lastPath.toArray()),
      ),
    );
  };

  private synchronizeCharacterPosition(char: Character) {
    const newPos = this.tileMap.tileCoordToWorld(char.coords);
    if (!newPos) {
      console.warn(
        "Character coordinates received from server does not match tilemap",
        char.coords,
      );
      return;
    }

    this.characterActors.get(char.id)?.lerpToPosition(newPos);
  }

  private deleteCharacter = (_: unknown, id: Character["id"]) => {
    const entity = this.characterActors.get(id);
    entity?.kill();
    this.characterActors.delete(id);
    this.characterCleanups.flush(id);
  };
}
