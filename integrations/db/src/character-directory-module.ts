import type { Cleanup } from "@rift/module";
import type { RiftServerEvent } from "@rift/core";
import { RiftServerModule } from "@rift/core";
import { inject } from "@rift/module";
import {
  CharacterListResponse,
  CharacterRenamedResponse,
  ClientCharacterRegistry,
  ListCharactersRequest,
  RenameCharacterRequest,
  type CharacterId,
} from "@mp/world";
import type { DbRepository } from "./repository";

export interface CharacterDirectoryOptions {
  readonly repo: DbRepository;
}

export class CharacterDirectoryModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #repo: DbRepository;

  constructor(opts: CharacterDirectoryOptions) {
    super();
    this.#repo = opts.repo;
  }

  init(): Cleanup {
    const offList = this.server.on(ListCharactersRequest, this.#onList);
    const offRename = this.server.on(RenameCharacterRequest, this.#onRename);
    return () => {
      offList();
      offRename();
    };
  }

  #onRename = async (
    event: RiftServerEvent<{ characterId: CharacterId; name: string }>,
  ): Promise<void> => {
    if (event.source.type !== "wire") {
      return;
    }
    const clientId = event.source.clientId;
    const userId = this.registry.getUserId(clientId);
    if (!userId) {
      return;
    }
    const access = await this.#repo.mayAccessCharacter({
      userId,
      characterId: event.data.characterId,
    });
    if (access.isErr() || !access.value) {
      return;
    }
    const updated = await this.#repo.updateCharacter({
      characterId: event.data.characterId,
      newName: event.data.name,
    });
    if (updated.isErr()) {
      return;
    }
    this.server.emit({
      type: CharacterRenamedResponse,
      data: { characterId: event.data.characterId, name: event.data.name },
      source: { type: "local" },
      target: { type: "wire", strategy: { type: "list", ids: [clientId] } },
    });
  };

  #onList = async (event: RiftServerEvent): Promise<void> => {
    if (event.source.type !== "wire") {
      return;
    }
    const clientId = event.source.clientId;
    const userId = this.registry.getUserId(clientId);
    if (!userId) {
      return;
    }
    const userCharsResult = await this.#repo.selectCharacterByUser(userId);
    if (userCharsResult.isErr()) {
      return;
    }
    const own = userCharsResult.value;
    const charactersByIdResult = own
      ? await this.#repo.selectCharacterList([own.id as CharacterId])
      : undefined;
    const characters =
      charactersByIdResult && charactersByIdResult.isOk()
        ? charactersByIdResult.value.map((c) => ({ id: c.id, name: c.name }))
        : [];
    this.server.emit({
      type: CharacterListResponse,
      data: { characters },
      source: { type: "local" },
      target: { type: "wire", strategy: { type: "list", ids: [clientId] } },
    });
  };
}
