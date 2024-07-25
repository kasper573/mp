import { TiledResource } from "@excaliburjs/plugin-tiled";
import type { SessionId, Area, Character, ServerMessages } from "@mp/server";
import type { Room } from "colyseus.js";
import { Scene, type DefaultLoader, Vector } from "excalibur";
import { messageSender, subscribe, type MessageSender } from "@mp/events";
import { CharacterActor } from "./CharacterActor";

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
      subscribe(this.input.pointers.primary, "move", this.onPointerMove),
    ];
  }

  override onDeactivate(): void {
    this.cleanups?.forEach((fn) => fn());
  }

  private onPointerMove = () => {
    const myActor = this.characterActors.get(this.myCharacterId);
    if (myActor) {
      const { x, y } = this.input.pointers.primary.lastWorldPos;
      myActor.pos = new Vector(x, y);
      this.bus.send("move", { x, y });
    }
  };

  private addCharacter = (char: Character) => {
    const actor = new CharacterActor(char);
    this.characterActors.set(char.id, actor);
    this.add(actor);

    if (char.id === this.myCharacterId) {
      this.camera.strategy.elasticToActor(actor, 0.8, 0.9);
    }

    this.cleanups?.push(
      char.onChange(() => {
        console.log("Updating character", char.id);
        actor.lerpTo = new Vector(char.coords.x, char.coords.y);
      }),
    );
  };

  private deleteCharacter = (_: unknown, id: Character["id"]) => {
    const entity = this.characterActors.get(id);
    console.log("Removing character", id);
    entity?.kill();
    this.characterActors.delete(id);
  };
}
