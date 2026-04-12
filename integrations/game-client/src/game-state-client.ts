import type { RiftClient, RiftQuery, Entity, EntityId } from "@rift/core";
import type { ReadonlySignal, Signal } from "@mp/state";
import { computed, signal } from "@mp/state";
import { throttle, dedupe } from "@mp/std";
import type { Tile } from "@mp/std";
import type { Vector } from "@mp/math";
import type { AreaId } from "@mp/fixtures";
import {
  Position,
  Movement,
  Combat,
  Appearance,
  AreaTag,
  ItemOwner,
  ItemDefinitionComp,
  SessionAssigned,
  MoveCommand,
  AttackCommand,
  RespawnCommand,
  RecallCommand,
} from "@mp/world";

export interface GameStateClientOptions {
  socket: WebSocket;
  rift: RiftClient;
}

export class GameStateClient {
  readonly rift: RiftClient;
  private readonly socket: WebSocket;

  readonly myEntityId: Signal<EntityId | undefined>;
  readonly myEntity: ReadonlySignal<Entity | undefined>;
  readonly isConnected: Signal<boolean>;
  readonly isGameReady: ReadonlySignal<boolean>;
  readonly actors: RiftQuery;
  readonly areaId: ReadonlySignal<AreaId | undefined>;
  readonly myItems: ReadonlySignal<Entity[]>;

  constructor(options: GameStateClientOptions) {
    this.rift = options.rift;
    this.socket = options.socket;
    this.myEntityId = signal(undefined);
    this.isConnected = signal(false);

    this.actors = this.rift.query(Position, Movement, Combat, Appearance);

    this.myEntity = computed(() => {
      const id = this.myEntityId.value;
      if (id === undefined) return undefined;
      // Reading actors.value to subscribe to entity changes
      void this.actors.value;
      return this.rift.entity(id);
    });

    this.isGameReady = computed(() => this.myEntity.value !== undefined);

    this.areaId = computed(() => {
      const entity = this.myEntity.value;
      if (!entity || !entity.has(AreaTag)) return undefined;
      return entity.get(AreaTag).areaId;
    });

    const allItems = this.rift.query(ItemOwner, ItemDefinitionComp);
    this.myItems = computed(() => {
      const myId = this.myEntityId.value;
      if (myId === undefined) return [];
      return allItems.value.filter(
        (item) => item.get(ItemOwner).ownerId === myId,
      );
    });
  }

  start = () => {
    const { socket, rift } = this;

    const onOpen = () => {
      this.isConnected.value = true;
    };

    const onClose = () => {
      this.isConnected.value = false;
      this.myEntityId.value = undefined;
    };

    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data instanceof ArrayBuffer) {
        rift.apply(new Uint8Array(data));
      } else if (data instanceof Blob) {
        void data.arrayBuffer().then((buf) => rift.apply(new Uint8Array(buf)));
      }
    };

    if (socket.readyState === WebSocket.OPEN) {
      this.isConnected.value = true;
    }

    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("message", onMessage);
    socket.binaryType = "arraybuffer";

    const unsubSessionAssigned = rift.on(SessionAssigned, (data) => {
      this.myEntityId.value = data.entityId;
    });

    this.stop = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("message", onMessage);
      unsubSessionAssigned();
    };

    return this.stop;
  };

  stop = () => {};

  move = dedupe(
    throttle((to: Vector<Tile>) => {
      this.send(MoveCommand, { x: to.x, y: to.y });
    }, 100),
    ([a], [b]) => a.equals(b),
  );

  attack(targetId: EntityId) {
    this.send(AttackCommand, { targetId });
  }

  respawn() {
    this.send(RespawnCommand, undefined);
  }

  recall() {
    this.send(RecallCommand, undefined);
  }

  private send<T>(type: Parameters<RiftClient["emit"]>[0], value: T) {
    const buf = this.rift.emit(type, value as never);
    this.socket.send(buf as Uint8Array<ArrayBuffer>);
  }
}
