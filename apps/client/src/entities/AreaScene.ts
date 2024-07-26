import { TiledResource } from "@excaliburjs/plugin-tiled";
import {
  type SessionId,
  type Area,
  type Character,
  type AreaMessages,
} from "@mp/server";
import type { Room } from "colyseus.js";
import { Scene, type DefaultLoader } from "excalibur";
import { messageSender, subscribe, type MessageSender } from "@mp/events";
import { vecToCoords } from "../data";
import { CharacterActor } from "./CharacterActor";

export class AreaScene extends Scene {
  private cleanups?: Array<() => void>;
  private characterActors: Map<SessionId, CharacterActor> = new Map();
  private tiledMap!: TiledResource;
  private bus: MessageSender<AreaMessages>;

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
    this.bus.send(
      "move",
      vecToCoords(this.input.pointers.primary.lastWorldPos),
    );
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
