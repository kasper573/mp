import {
  type SessionId,
  type Area,
  type Character,
  type AreaMessages,
} from "@mp/server";
import type { Room } from "colyseus.js";
import { Scene, type DefaultLoader } from "@mp/excalibur";
import {
  Cleanup,
  CleanupMap,
  messageSender,
  subscribe,
  type MessageSender,
} from "@mp/events";
import { TiledResource } from "@mp/excalibur";
import { CharacterActor } from "./CharacterActor";

export class AreaScene extends Scene {
  private cleanups = new Cleanup();
  private characterCleanups = new CleanupMap();
  private characterActors: Map<SessionId, CharacterActor> = new Map();
  private tileMap!: TiledResource;
  private bus: MessageSender<AreaMessages>;

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
    loader.areResourcesLoaded().then(() => this.tileMap.addToScene(this));
  }

  override onActivate(): void {
    const { characters } = this.room.state;
    this.cleanups.add(
      characters.onAdd(this.addCharacter),
      characters.onRemove(this.deleteCharacter),
      subscribe(this.input.pointers.primary, "down", this.moveToPointer),
    );
  }

  override onDeactivate(): void {
    this.cleanups.flush();
  }

  private moveToPointer = () => {
    const tiledPos = this.tileMap.worldCoordToTile(
      this.input.pointers.primary.lastWorldPos,
    );

    if (!tiledPos) {
      console.warn("Could not translate pointer position to tile coordinate");
      return;
    }

    this.bus.send("move", [tiledPos.x, tiledPos.y]);
  };

  private addCharacter = (char: Character) => {
    const actor = new CharacterActor(char);
    this.characterActors.set(char.id, actor);
    this.add(actor);

    if (char.id === this.myCharacterId) {
      this.camera.strategy.elasticToActor(actor, 0.8, 0.9);
    }

    this.synchronizeCharacterPosition(char);
    this.characterCleanups.add(
      char.id,
      char.coords.onChange(() => this.synchronizeCharacterPosition(char)),
    );
  };

  private synchronizeCharacterPosition(char: Character) {
    console.log("synchronizing", char.id, char.coords.toString());
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
