import type { ClientId, EntityId, World, ClientTransport } from "@rift/core";
import { RiftClient } from "@rift/core";
import {
  CharacterListResponse,
  CharacterTag,
  InventoryRef,
  JoinAsPlayer,
  JoinAsSpectator,
  Leave,
  ListCharactersRequest,
  Movement,
  Recall,
  Respawn,
  RequestFullState,
  moveAlongPath,
  schema,
  type AreaId,
  type CharacterId,
} from "@mp/world";
import { computed, signal, type ReadonlySignal } from "@mp/state";
import type { Logger } from "@mp/logger";
import type { TimeSpan } from "@mp/time";
import {
  nearestCardinalDirection,
  Vector,
  type CardinalDirection,
} from "@mp/math";
import { GameActions } from "./game-actions";
import type { Actor, Character, ItemInstance } from "./types";
import { readActor, readItemInstance } from "./types";
import { ClientEventBus } from "./client-event-bus";

export interface GameStateClientOptions {
  readonly transport: ClientTransport;
  readonly logger: Logger;
  readonly settings: () => OptimisticGameStateSettings;
}

export interface OptimisticGameStateSettings {
  useInterpolator: boolean;
}

export interface CharacterSummary {
  readonly id: CharacterId;
  readonly name: string;
}

export class GameStateClient {
  readonly client: RiftClient;
  readonly eventBus: ClientEventBus;
  readonly actions: GameActions;
  readonly characterId = signal<CharacterId | undefined>(undefined);
  readonly characterList = signal<readonly CharacterSummary[]>([]);

  readonly isConnected: ReadonlySignal<boolean>;
  readonly areaId: ReadonlySignal<AreaId | undefined>;
  readonly isGameReady: ReadonlySignal<boolean>;

  readonly actorList: ReadonlySignal<readonly Actor[]>;
  readonly character: ReadonlySignal<Character | undefined>;
  readonly inventory: ReadonlySignal<readonly ItemInstance[]>;

  readonly gameState: { frameCallback: (timeSinceLastFrame: TimeSpan) => void };

  #unsubscribers: Array<() => void> = [];
  #spectatedId: CharacterId | undefined;
  #joinedAs: CharacterId | undefined;

  constructor(public options: GameStateClientOptions) {
    this.client = new RiftClient({
      schema,
      transport: options.transport,
    });
    this.eventBus = new ClientEventBus(this.client);
    this.actions = new GameActions(this.client);

    this.isConnected = computed(() => this.client.state.value === "open");

    this.actorList = computed(() => {
      const result: Actor[] = [];
      for (const [id] of this.client.world.query(Movement)) {
        const actor = readActor(this.client.world, id);
        if (actor) {
          result.push(actor);
        }
      }
      return result;
    });

    this.character = computed(() => {
      const charId = this.characterId.value;
      if (!charId) {
        return undefined;
      }
      const entityId = findCharacterEntity(this.client.world, charId);
      if (entityId === undefined) {
        return undefined;
      }
      const actor = readActor(this.client.world, entityId);
      return actor?.type === "character" ? actor : undefined;
    });

    this.areaId = computed(() => this.character.value?.areaId);

    this.isGameReady = computed(() => !!this.areaId.value);

    this.inventory = computed(() => {
      const inventoryId = this.character.value?.inventoryId;
      if (!inventoryId) {
        return [];
      }
      const result: ItemInstance[] = [];
      for (const [id] of this.client.world.query(InventoryRef)) {
        const ref = this.client.world.get(id, InventoryRef);
        if (ref?.inventoryId !== inventoryId) {
          continue;
        }
        const item = readItemInstance(this.client.world, id);
        if (item) {
          result.push(item);
        }
      }
      return result;
    });

    this.gameState = {
      frameCallback: (timeSinceLastFrame) => {
        if (!this.options.settings().useInterpolator) {
          return;
        }
        for (const [id, mv] of this.client.world.query(Movement)) {
          if (mv.path.length === 0) {
            continue;
          }
          const updated = moveAlongPath(
            {
              coords: { x: mv.coords.x, y: mv.coords.y },
              speed: mv.speed,
              path: mv.path.map((p) => ({ x: p.x, y: p.y })),
            },
            timeSinceLastFrame.totalSeconds,
          );
          const target = updated.path[0];
          let direction: CardinalDirection = mv.direction;
          if (target) {
            direction = nearestCardinalDirection(
              new Vector(updated.coords.x, updated.coords.y).angle(
                new Vector(target.x, target.y),
              ),
            );
          }
          this.client.world.set(id, Movement, {
            ...mv,
            coords: updated.coords,
            path: updated.path,
            direction,
          });
        }
      },
    };
  }

  start = (): (() => void) => {
    const offCharacterList = this.client.on(CharacterListResponse, (event) => {
      this.characterList.value = event.data.characters.map((c) => ({
        id: c.id,
        name: c.name,
      }));
    });

    const stopRejoinOnReconnect = this.isConnected.subscribe((connected) => {
      if (connected) {
        this.requestCharacterList();
        if (this.#spectatedId) {
          this.spectate(this.#spectatedId);
        } else if (this.#joinedAs) {
          this.joinAs(this.#joinedAs);
        }
      }
    });

    this.#unsubscribers = [offCharacterList, stopRejoinOnReconnect];

    void this.client.connect().catch((err: unknown) => {
      this.options.logger.error(err, "rift connect failed");
    });

    return this.stop;
  };

  stop = (): void => {
    for (const unsub of this.#unsubscribers) {
      unsub();
    }
    this.#unsubscribers = [];
    void this.client.disconnect();
  };

  requestCharacterList(): void {
    this.client.emit({
      type: ListCharactersRequest,
      data: {},
      source: "local",
      target: "wire",
    });
  }

  joinAs(characterId: CharacterId): void {
    this.#joinedAs = characterId;
    this.#spectatedId = undefined;
    this.client.emit({
      type: JoinAsPlayer,
      data: { characterId },
      source: "local",
      target: "wire",
    });
  }

  spectate(characterId: CharacterId): void {
    this.#spectatedId = characterId;
    this.#joinedAs = undefined;
    this.client.emit({
      type: JoinAsSpectator,
      data: { characterId },
      source: "local",
      target: "wire",
    });
  }

  leave(): void {
    this.#joinedAs = undefined;
    this.#spectatedId = undefined;
    this.client.emit({
      type: Leave,
      data: {},
      source: "local",
      target: "wire",
    });
  }

  respawn(): void {
    this.client.emit({
      type: Respawn,
      data: {},
      source: "local",
      target: "wire",
    });
  }

  recall(): void {
    this.client.emit({
      type: Recall,
      data: {},
      source: "local",
      target: "wire",
    });
  }

  requestFullState(): void {
    this.client.emit({
      type: RequestFullState,
      data: {},
      source: "local",
      target: "wire",
    });
  }
}

function findCharacterEntity(
  world: World,
  characterId: CharacterId,
): EntityId | undefined {
  for (const [id, tag] of world.query(CharacterTag)) {
    if (tag.characterId === characterId) {
      return id;
    }
  }
  return undefined;
}

export type { ClientId };
