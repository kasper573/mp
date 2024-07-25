import { TiledResource } from "@excaliburjs/plugin-tiled";
import {
  type SessionId,
  type Area,
  type Character,
  type ServerMessages,
} from "@mp/server";
import type { Room } from "colyseus.js";
import { Scene, type DefaultLoader } from "excalibur";
import { messageSender, subscribe, type MessageSender } from "@mp/events";
import { CharacterActor } from "./CharacterActor";
import { vecToCoords } from "./data";

export class AreaScene extends Scene {
  private cleanups?: Array<() => void>;
  private characterActors: Map<SessionId, CharacterActor> = new Map();
  private tiledMap!: TiledResource;
  private bus: MessageSender<ServerMessages>;

  get myCharacterId() {
    return this.room.sessionId;
  }

  constructor(private room: Room<Area>) {
    super();
    this.bus = messageSender(this.room);
  }

  override onPreLoad(loader: DefaultLoader): void {
    this.tiledMap = new TiledResource("areas/island.tmx", {
      useTilemapCameraStrategy: true,
    });
    loader.addResource(this.tiledMap);
    loader.areResourcesLoaded().then(() => this.tiledMap.addToScene(this));
  }

  override onActivate(): void {
    const { characters } = this.room.state;
    this.cleanups = [
      characters.onAdd(this.addCharacter),
      characters.onRemove(this.deleteCharacter),
      subscribe(this.input.pointers.primary, "down", this.moveToPointer),
    ];
  }

  override onDeactivate(): void {
    this.cleanups?.forEach((fn) => fn());
  }

  private moveToPointer = () => {
    const myActor = this.characterActors.get(this.myCharacterId);
    if (myActor) {
      myActor.pos = this.input.pointers.primary.lastWorldPos;
      this.bus.send("move", vecToCoords(myActor.pos));
    }
  };

  private addCharacter = (char: Character) => {
    const actor = new CharacterActor(char);
    this.characterActors.set(char.id, actor);
    this.add(actor);

    if (char.id === this.myCharacterId) {
      this.camera.strategy.elasticToActor(actor, 0.8, 0.9);
    }
  };

  private deleteCharacter = (_: unknown, id: Character["id"]) => {
    const entity = this.characterActors.get(id);
    entity?.kill();
    this.characterActors.delete(id);
  };
}
