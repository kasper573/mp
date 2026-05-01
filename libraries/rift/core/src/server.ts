import type { ClientId, EntityId } from "./protocol";
import { RiftCloseCode } from "./transport";
import { EventBus } from "@rift/event";
import type { RiftEvent, UnsubscribeFn } from "@rift/event";
import { internal } from "./internal";
import { Reader } from "@rift/types";
import type { InferValue, RiftType } from "@rift/types";
import type { RiftSchema } from "./schema";
import type { ServerTransportEvent, ServerTransport } from "./transport";
import {
  DeltaOp,
  Opcode,
  ClientConnected,
  ClientDisconnected,
  Tick,
} from "./protocol";
import { Writer } from "@rift/types";
import type { World } from "./world";
import { createWorld } from "./world";
import {
  type Cleanup,
  inject,
  initializeModules,
  RiftModule,
} from "@rift/module";

export interface ServerOptions {
  readonly schema: RiftSchema;
  readonly transport: ServerTransport;
  readonly modules?: readonly RiftServerModule[];
  readonly tickRateHz?: number;
  readonly handshakeTimeoutMs?: number;
}

interface ClientSlot {
  readonly id: ClientId;
  visibilityPredicate?: VisibilityPredicate;
  handshakeCompleted: boolean;
  knownEntities: Set<EntityId>;
  knownComponents: Map<EntityId, Set<RiftType>>;
  handshakeTimer?: ReturnType<typeof setTimeout>;
}

export type VisibilityPredicate = (entityId: EntityId) => boolean;

export type RiftServerEvent<Data = unknown> = RiftEvent<
  Data,
  RiftServerEventSource,
  RiftServerEventTarget
>;

export type inferServerEvent<Type extends RiftType> = RiftServerEvent<
  InferValue<Type>
>;

export type RiftServerEventSource =
  | { type: "local" }
  | { type: "wire"; clientId: ClientId };

export type RiftServerEventTarget =
  | { type: "local" }
  | { type: "wire"; strategy: ClientSelectionStrategy };

export type ClientSelectionStrategy =
  | { type: "broadcast" }
  | { type: "list"; ids: ClientId[] }
  | { type: "entity"; entityId: EntityId };

export class RiftServer extends EventBus<
  RiftServerEventSource,
  RiftServerEventTarget
> {
  readonly world: World;
  readonly schema: RiftSchema;

  readonly #transport: ServerTransport;
  readonly #modules: readonly RiftServerModule[];
  readonly #hash: Uint8Array;
  readonly #clients = new Map<ClientId, ClientSlot>();
  readonly #eventQueue: RiftServerEvent[] = [];
  readonly #handshakeTimeoutMs: number;
  readonly #tickRateHz: number;

  #tickNumber = 0;
  #lastTickTime = 0;
  #serverTimeMs = 0;
  #tickTimer?: ReturnType<typeof setInterval>;
  #started = false;
  #stopping = false;
  #moduleCleanup?: Cleanup;

  constructor(opts: ServerOptions) {
    super();
    this.schema = opts.schema;
    this.#transport = opts.transport;
    this.#modules = opts.modules ?? [];
    this.#hash = opts.schema.digest();
    this.#handshakeTimeoutMs = opts.handshakeTimeoutMs ?? 5000;
    this.#tickRateHz = opts.tickRateHz ?? 30;
    this.world = createWorld(opts.schema);
  }

  #unsubscribeFromEmit?: UnsubscribeFn;
  async start(): Promise<void> {
    if (this.#started) {
      return;
    }
    this.#unsubscribeFromEmit = this.onAny(this.#onEmit);
    this.#started = true;
    this.#moduleCleanup = await initializeModules([this, ...this.#modules]);
    this.#transport.on((ev) => this.#onTransportEvent(ev));
    if (this.#tickRateHz > 0) {
      const interval = 1000 / this.#tickRateHz;
      this.#tickTimer = setInterval(() => this.tick(), interval);
    }
  }

  async stop(
    code: number = RiftCloseCode.ServerShutdown,
    reason = "shutdown",
  ): Promise<void> {
    if (this.#stopping) {
      return;
    }
    this.#stopping = true;
    this.#unsubscribeFromEmit?.();
    if (this.#tickTimer) {
      clearInterval(this.#tickTimer);
      this.#tickTimer = undefined;
    }
    for (const slot of this.#clients.values()) {
      if (slot.handshakeTimer) {
        clearTimeout(slot.handshakeTimer);
      }
    }
    await this.#transport.shutdown(code, reason);
    this.#clients.clear();
    if (this.#moduleCleanup) {
      await this.#moduleCleanup();
      this.#moduleCleanup = undefined;
    }
  }

  tick(dtSeconds?: number): void {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const dt =
      dtSeconds ??
      (this.#lastTickTime === 0
        ? this.#tickRateHz > 0
          ? 1 / this.#tickRateHz
          : 0
        : (now - this.#lastTickTime) / 1000);
    this.#lastTickTime = now;
    this.#tickNumber++;
    this.#serverTimeMs += dt * 1000;

    this.emit({
      type: Tick,
      data: { tick: this.#tickNumber, dt },
      source: { type: "local" },
      target: { type: "local" },
    });
    this.#drainEventQueue();

    for (const slot of this.#clients.values()) {
      this.#flushClient(slot);
    }

    this.world[internal].clearDirty();
  }

  setClientVisibilityPredicate(
    clientId: ClientId,
    predicate: VisibilityPredicate | undefined,
  ): void {
    const slot = this.#clients.get(clientId);
    if (!slot) {
      return;
    }
    slot.visibilityPredicate = predicate;
  }

  getClientIds(): readonly ClientId[] {
    return [...this.#clients.keys()];
  }

  #onEmit = (event: RiftServerEvent) => {
    this.#eventQueue.push(event);
  };

  #drainEventQueue(): void {
    const batch = this.#eventQueue.splice(0, this.#eventQueue.length);
    for (const event of batch) {
      if (event.target.type === "wire") {
        this.#sendToClients(
          this.#selectClientIds(event.target.strategy),
          event,
        );
      }
    }
  }

  #selectClientIds(strategy: ClientSelectionStrategy): Iterable<ClientId> {
    switch (strategy.type) {
      case "broadcast":
        return this.#clients.keys();
      case "list":
        return strategy.ids;
      case "entity": {
        const ids: ClientId[] = [];
        for (const [id, slot] of this.#clients) {
          if (this.#clientSeesEntity(slot, strategy.entityId)) {
            ids.push(id);
          }
        }
        return ids;
      }
    }
  }

  #sendToClients<Data>(
    clientIds: Iterable<ClientId>,
    event: RiftServerEvent<Data>,
  ): void {
    const idx = this.schema.eventIndexOf(event.type);
    if (idx === undefined) {
      // Unknown event type, can't send.
      return;
    }
    const w = new Writer(64);
    w.writeU8(Opcode.EventToClient);
    w.writeU16(idx);
    event.type.encode(w, event.data);
    const bytes = w.finish();
    for (const id of clientIds) {
      const slot = this.#clients.get(id);
      if (slot && slot.handshakeCompleted) {
        this.#transport.send(id, bytes);
      }
    }
  }

  #clientSeesEntity(slot: ClientSlot, entityId: EntityId): boolean {
    return slot.visibilityPredicate?.(entityId) ?? true;
  }

  #buildSnapshotFor(slot: ClientSlot): Uint8Array<ArrayBuffer> {
    const w = new Writer(256);
    w.writeU8(Opcode.Accept);
    w.writeU32(this.#tickNumber);
    w.writeU32(this.#serverTimeMs >>> 0);
    w.writeU32(slot.id);
    w.writeBytes(this.#hash);
    const visible: Array<{
      id: EntityId;
      components: Array<[RiftType, number, unknown]>;
    }> = [];
    for (const ent of this.world[internal].entities.values()) {
      if (!this.#clientSeesEntity(slot, ent.id)) {
        continue;
      }
      const comps: Array<[RiftType, number, unknown]> = [];
      for (const [ty, compSlot] of ent.components) {
        const idx = this.schema.componentIndexOf(ty);
        if (idx !== undefined) {
          comps.push([ty, idx, compSlot.signal.value]);
        }
      }
      comps.sort((a, b) => a[1] - b[1]);
      visible.push({ id: ent.id, components: comps });
    }
    w.writeU32(visible.length);
    for (const { id, components } of visible) {
      w.writeU32(id);
      w.writeU16(components.length);
      for (const [ty, idx, value] of components) {
        w.writeU16(idx);
        ty.encode(w, value);
        const known = slot.knownComponents.get(id);
        if (known) {
          known.add(ty);
        } else {
          slot.knownComponents.set(id, new Set([ty]));
        }
      }
      slot.knownEntities.add(id);
    }
    return w.finish();
  }

  #flushClient(slot: ClientSlot): void {
    if (!slot.handshakeCompleted) {
      return;
    }
    const w = new Writer(128);
    w.writeU8(Opcode.Delta);
    w.writeU32(this.#tickNumber);
    w.writeU32(this.#serverTimeMs >>> 0);
    const ops: Array<() => void> = [];

    const visibleNow = new Set<EntityId>();
    for (const ent of this.world[internal].entities.values()) {
      if (this.#clientSeesEntity(slot, ent.id)) {
        visibleNow.add(ent.id);
      }
    }

    for (const id of slot.knownEntities) {
      if (!visibleNow.has(id)) {
        ops.push(() => {
          w.writeU8(DeltaOp.EntityDestroyed);
          w.writeU32(id);
        });
        slot.knownEntities.delete(id);
        slot.knownComponents.delete(id);
      }
    }

    for (const id of visibleNow) {
      const ent = this.world[internal].entities.get(id);
      if (!ent) {
        continue;
      }
      const isNew = !slot.knownEntities.has(id);
      if (isNew) {
        ops.push(() => {
          w.writeU8(DeltaOp.EntityCreated);
          w.writeU32(id);
        });
        slot.knownEntities.add(id);
        slot.knownComponents.set(id, new Set());
      }
      const known = slot.knownComponents.get(id) ?? new Set<RiftType>();
      slot.knownComponents.set(id, known);
      const currentComps = new Set<RiftType>();
      for (const [ty, compSlot] of ent.components) {
        const idx = this.schema.componentIndexOf(ty);
        if (idx === undefined) {
          continue;
        }
        currentComps.add(ty);
        if (!known.has(ty)) {
          ops.push(() => {
            w.writeU8(DeltaOp.ComponentAdded);
            w.writeU32(id);
            w.writeU16(idx);
            ty.encode(w, compSlot.signal.value);
          });
          known.add(ty);
        } else if (compSlot.dirty || isNew) {
          ops.push(() => {
            w.writeU8(DeltaOp.ComponentUpdated);
            w.writeU32(id);
            w.writeU16(idx);
            ty.encode(w, compSlot.signal.value);
          });
        }
      }
      for (const ty of known) {
        if (!currentComps.has(ty)) {
          const idx = this.schema.componentIndexOf(ty);
          if (idx !== undefined) {
            ops.push(() => {
              w.writeU8(DeltaOp.ComponentRemoved);
              w.writeU32(id);
              w.writeU16(idx);
            });
          }
          known.delete(ty);
        }
      }
    }

    if (ops.length === 0) {
      return;
    }
    w.writeU32(ops.length);
    for (const op of ops) {
      op();
    }
    this.#transport.send(slot.id, w.finish());
  }

  #finalizeHandshake(slot: ClientSlot): void {
    slot.handshakeCompleted = true;
    if (slot.handshakeTimer) {
      clearTimeout(slot.handshakeTimer);
      slot.handshakeTimer = undefined;
    }
    const snapshot = this.#buildSnapshotFor(slot);
    this.#transport.send(slot.id, snapshot);
    this.emit({
      type: ClientConnected,
      data: { clientId: slot.id },
      source: { type: "local" },
      target: { type: "local" },
    });
  }

  #handleHello(slot: ClientSlot, data: Uint8Array): void {
    const r = new Reader(data, 1);
    const clientHash = r.readBytes();
    let mismatch = clientHash.byteLength !== this.#hash.byteLength;
    if (!mismatch) {
      for (let i = 0; i < this.#hash.byteLength; i++) {
        if (clientHash[i] !== this.#hash[i]) {
          mismatch = true;
          break;
        }
      }
    }
    if (mismatch) {
      this.#transport.close(
        slot.id,
        RiftCloseCode.SchemaMismatch,
        "schema mismatch",
      );
      return;
    }
    this.#finalizeHandshake(slot);
  }

  #handleClientEvent(slot: ClientSlot, data: Uint8Array): void {
    if (!slot.handshakeCompleted) {
      this.#transport.close(
        slot.id,
        RiftCloseCode.ProtocolError,
        "event before handshake",
      );
      return;
    }
    const r = new Reader(data, 1);
    const idx = r.readU16();
    const type = this.schema.events[idx];
    if (!type) {
      this.#transport.close(
        slot.id,
        RiftCloseCode.ProtocolError,
        `unknown event index: ${idx}`,
      );
      return;
    }
    this.emit({
      type: type,
      data: type.decode(r),
      source: { type: "wire", clientId: slot.id },
      target: { type: "local" },
    });
  }

  #onTransportEvent(ev: ServerTransportEvent): void {
    switch (ev.type) {
      case "open": {
        const slot: ClientSlot = {
          id: ev.clientId,
          handshakeCompleted: false,
          knownEntities: new Set(),
          knownComponents: new Map(),
        };
        slot.handshakeTimer = setTimeout(() => {
          this.#transport.close(
            ev.clientId,
            RiftCloseCode.HandshakeTimeout,
            "handshake timeout",
          );
        }, this.#handshakeTimeoutMs);
        this.#clients.set(ev.clientId, slot);
        return;
      }
      case "message": {
        const slot = this.#clients.get(ev.clientId);
        if (!slot || ev.data.byteLength === 0) {
          return;
        }
        const op = ev.data[0] as Opcode;
        if (op === Opcode.Hello) {
          this.#handleHello(slot, ev.data);
        } else if (op === Opcode.EventFromClient) {
          this.#handleClientEvent(slot, ev.data);
        } else {
          this.#transport.close(
            slot.id,
            RiftCloseCode.ProtocolError,
            `bad opcode: ${op}`,
          );
        }
        return;
      }
      case "close": {
        const slot = this.#clients.get(ev.clientId);
        if (!slot) {
          return;
        }
        if (slot.handshakeTimer) {
          clearTimeout(slot.handshakeTimer);
        }
        this.#clients.delete(ev.clientId);
        if (slot.handshakeCompleted) {
          this.emit({
            type: ClientDisconnected,
            data: {
              clientId: ev.clientId,
              code: ev.code,
              reason: ev.reason,
            },
            source: { type: "local" },
            target: { type: "local" },
          });
        }
        return;
      }
      case "error": {
        return;
      }
    }
  }
}

export abstract class RiftServerModule extends RiftModule {
  @inject(RiftServer) accessor server!: RiftServer;
}
