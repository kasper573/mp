import type { Cleanup } from "@rift/module";
import type { inferServerEvent } from "@rift/core";
import { RiftServerModule } from "@rift/core";
import { inject } from "@rift/module";
import {
  CharacterListResponse,
  CharacterRenamedResponse,
  ClientCharacterRegistry,
  ListCharactersRequest,
  RenameCharacterRequest,
  type ActorModelId,
  type AreaId,
} from "@mp/world";
import { combine, type Tile } from "@mp/std";
import type { Vector } from "@mp/math";
import type { DbRepository } from "./repository";

export interface CharacterDirectoryOptions {
  readonly repo: DbRepository;
  readonly defaultModelId: ActorModelId;
  readonly defaultSpawn: { areaId: AreaId; coords: Vector<Tile> };
}

export class CharacterDirectoryModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #opts: CharacterDirectoryOptions;

  constructor(opts: CharacterDirectoryOptions) {
    super();
    this.#opts = opts;
  }

  init(): Cleanup {
    return combine(
      this.server.on(ListCharactersRequest, this.#onList),
      this.server.on(RenameCharacterRequest, this.#onRename),
    );
  }

  #onRename = async (
    event: inferServerEvent<typeof RenameCharacterRequest>,
  ): Promise<void> => {
    if (event.source.type !== "wire") {
      return;
    }
    const clientId = event.source.clientId;
    const userId = this.registry.getUserId(clientId);
    if (!userId) {
      return;
    }
    const access = await this.#opts.repo.mayAccessCharacter({
      userId,
      characterId: event.data.characterId,
    });
    if (access.isErr() || !access.value) {
      return;
    }
    const updated = await this.#opts.repo.updateCharacter({
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

  #onList = async (
    event: inferServerEvent<typeof ListCharactersRequest>,
  ): Promise<void> => {
    if (event.source.type !== "wire") {
      return;
    }
    const clientId = event.source.clientId;
    const user = this.registry.getUser(clientId);
    if (!user) {
      return;
    }
    const ensureResult = await this.#opts.repo.selectOrCreateCharacterIdForUser(
      {
        user,
        spawnPoint: this.#opts.defaultSpawn,
        defaultModelId: this.#opts.defaultModelId,
      },
    );
    if (ensureResult.isErr()) {
      return;
    }
    const characterId = ensureResult.value;
    const listResult = await this.#opts.repo.selectCharacterList([characterId]);
    const characters = listResult.isOk()
      ? listResult.value.map((c) => ({ id: c.id, name: c.name }))
      : [];
    this.server.emit({
      type: CharacterListResponse,
      data: characters,
      source: { type: "local" },
      target: { type: "wire", strategy: { type: "list", ids: [clientId] } },
    });
  };
}
