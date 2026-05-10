import type { Feature } from "@rift/feature";
import { signal, type ReadonlySignal, type Signal } from "@preact/signals-core";
import { combine } from "@mp/std";
import {
  CharacterListResponse,
  CharacterRenamedResponse,
} from "../character/events";
import type { CharacterId } from "../identity/ids";
import { requestCharacterList } from "./actions";

export interface KnownCharacter {
  readonly id: CharacterId;
  readonly name: string;
}

export class CharacterList {
  readonly #characters: Signal<readonly KnownCharacter[]> = signal([]);

  get characters(): ReadonlySignal<readonly KnownCharacter[]> {
    return this.#characters;
  }

  setAll(list: readonly KnownCharacter[]): void {
    this.#characters.value = list;
  }

  rename(id: CharacterId, name: string): void {
    this.#characters.value = this.#characters.value.map((c) =>
      c.id === id ? { ...c, name } : c,
    );
  }
}

export function characterListFeature(list: CharacterList): Feature {
  return {
    client(client) {
      let prevOpen = false;
      return combine(
        client.on(CharacterListResponse, (event) => {
          list.setAll(event.data.map((c) => ({ id: c.id, name: c.name })));
        }),
        client.on(CharacterRenamedResponse, (event) => {
          list.rename(event.data.characterId, event.data.name);
        }),
        client.state.subscribe((state) => {
          const isOpen = state === "open";
          if (isOpen && !prevOpen) {
            requestCharacterList(client);
          }
          prevOpen = isOpen;
        }),
      );
    },
  };
}
