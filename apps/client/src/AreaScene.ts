import { TiledResource } from "@excaliburjs/plugin-tiled";
import type { SessionId, Area, Character } from "@mp/server";
import type { Room } from "colyseus.js";
import { Scene, type DefaultLoader, Vector } from "excalibur";
import { CharacterActor } from "./CharacterActor";
import { subscribe } from "./subscribe";

export class AreaScene extends Scene {
  private cleanups?: Array<() => void>;
  private characters: Map<SessionId, CharacterActor> = new Map();

  constructor(private room: Room<Area>) {
    super();
  }

  override onPreLoad(loader: DefaultLoader): void {
    const map = new TiledResource("areas/island.tmx");
    loader.addResource(map);
    loader.areResourcesLoaded().then(() => map.addToScene(this));
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
    const myActor = this.characters.get(this.room.sessionId);
    if (myActor) {
      const { x, y } = this.input.pointers.primary.lastWorldPos;
      myActor.pos = new Vector(x, y);
      this.room.send(0, { x, y });
    }
  };

  private addCharacter = (char: Character) => {
    const entity = new CharacterActor(char);
    this.characters.set(char.id, entity);
    this.add(entity);
    this.cleanups?.push(
      char.onChange(() => {
        console.log("Updating character", char.id);
        entity.lerpTo = new Vector(char.coords.x, char.coords.y);
      }),
    );
  };

  private deleteCharacter = (_: unknown, id: Character["id"]) => {
    const entity = this.characters.get(id);
    console.log("Removing character", id);
    entity?.kill();
    this.characters.delete(id);
  };
}
