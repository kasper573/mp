import { RiftClientModule } from "@rift/core";
import type { Cleanup } from "@rift/module";
import { signal, type ReadonlySignal, type Signal } from "@preact/signals-core";
import {
  CharacterListResponse,
  CharacterRenamedResponse,
} from "../character/events";
import type { CharacterId } from "../identity/ids";
import { requestCharacterList } from "./actions";
import { combine } from "@mp/std";

export interface KnownCharacter {
  readonly id: CharacterId;
  readonly name: string;
}

export class CharacterListModule extends RiftClientModule {
  readonly #characters: Signal<readonly KnownCharacter[]> = signal([]);

  get characters(): ReadonlySignal<readonly KnownCharacter[]> {
    return this.#characters;
  }

  init(): Cleanup {
    const offList = this.client.on(CharacterListResponse, (event) => {
      this.#characters.value = event.data.map((c) => ({
        id: c.id,
        name: c.name,
      }));
    });
    const offRenamed = this.client.on(CharacterRenamedResponse, (event) => {
      this.#characters.value = this.#characters.value.map((c) =>
        c.id === event.data.characterId ? { ...c, name: event.data.name } : c,
      );
    });
    let prevOpen = false;
    const offState = this.client.state.subscribe((state) => {
      const isOpen = state === "open";
      if (isOpen && !prevOpen) {
        requestCharacterList(this.client);
      }
      prevOpen = isOpen;
    });
    return combine(offList, offRenamed, offState);
  }
}
