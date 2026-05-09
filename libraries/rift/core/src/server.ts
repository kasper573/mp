import type { ClientId, EntityId } from "./protocol";
import { RiftCloseCode } from "./transport";
import { EventBus } from "@rift/event";
import type { RiftEvent, UnsubscribeFn } from "@rift/event";
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
import { World } from "./world";

export type VisibilityFn = (
  clientId: ClientId,
) => Iterable<EntityId> | undefined;

export interface ServerOptions {
  readonly schema: RiftSchema;
  readonly transport: ServerTransport;
  readonly tickRateHz?: number;
  readonly handshakeTimeoutMs?: number;
  readonly visibility?: VisibilityFn;
}

interface ClientSlot {
  readonly id: ClientId;
  handshakeCompleted: boolean;
  knownEntities: Set<EntityId>;
  knownComponents: Map<EntityId, Set<RiftType>>;
  handshakeTimer?: ReturnType<typeof setTimeout>;
}

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
  readonly #hash: Uint8Array;
  readonly #clients = new Map<ClientId, ClientSlot>();
  readonly #eventQueue: RiftServerEvent[] = [];
  readonly #handshakeTimeoutMs: number;
  readonly #tickRateHz: number;
  #visibility?: VisibilityFn;

  #tickNumber = 0;
  #lastTickTime = 0;
  #serverTimeMs = 0;
  #tickTimer?: ReturnType<typeof setInterval>;
  #started = false;
  #stopping = false;

  constructor(opts: ServerOptions) {
    super();
    this.schema = opts.schema;
    this.#transport = opts.transport;
    this.#hash = opts.schema.digest();
    this.#handshakeTimeoutMs = opts.handshakeTimeoutMs ?? 5000;
    this.#tickRateHz = opts.tickRateHz ?? 30;
    this.#visibility = opts.visibility;
    this.world = new World(opts.schema);
  }

  setVisibility(fn: VisibilityFn | undefined): void {
    this.#visibility = fn;
  }

  #unsubscribeFromEmit?: UnsubscribeFn;
  start(): Promise<void> {
    if (this.#started) {
      return Promise.resolve();
    }
    this.#unsubscribeFromEmit = this.onAny(this.#onEmit);
    this.#started = true;
    this.#transport.on((ev) => this.#onTransportEvent(ev));
    if (this.#tickRateHz > 0) {
      const interval = 1000 / this.#tickRateHz;
      this.#tickTimer = setInterval(() => this.tick(), interval);
    }
    return Promise.resolve();
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

    this.world.clearChanges();
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

  #visibleSet(slot: ClientSlot): Set<EntityId> {
    const visible = new Set<EntityId>();
    if (this.#visibility === undefined) {
      for (const id of this.world.entities()) visible.add(id);
      return visible;
    }
    const result = this.#visibility(slot.id);
    if (result === undefined) {
      for (const id of this.world.entities()) visible.add(id);
      return visible;
    }
    for (const id of result) visible.add(id);
    return visible;
  }

  #clientSeesEntity(slot: ClientSlot, entityId: EntityId): boolean {
    if (this.#visibility === undefined) {
      return this.world.exists(entityId);
    }
    const result = this.#visibility(slot.id);
    if (result === undefined) return this.world.exists(entityId);
    for (const id of result) {
      if (id === entityId) return true;
    }
    return false;
  }

  #buildSnapshotFor(slot: ClientSlot): Uint8Array<ArrayBuffer> {
    const w = new Writer(256);
    w.writeU8(Opcode.Accept);
    w.writeVarU32(this.#tickNumber);
    w.writeVarU32(this.#serverTimeMs >>> 0);
    w.writeVarU32(slot.id);
    w.writeBytes(this.#hash);
    const visible = this.#visibleSet(slot);
    const entries: Array<{
      id: EntityId;
      components: Array<[RiftType, number, unknown]>;
    }> = [];
    for (const id of visible) {
      if (!this.world.exists(id)) continue;
      const comps: Array<[RiftType, number, unknown]> = [];
      for (const ty of this.schema.components) {
        const idx = this.schema.componentIndexOf(ty);
        if (idx === undefined) continue;
        const pool = this.world.pool(ty);
        const value = pool.values.get(id);
        if (value === undefined) continue;
        comps.push([ty, idx, value]);
      }
      comps.sort((a, b) => a[1] - b[1]);
      entries.push({ id, components: comps });
    }
    w.writeVarU32(entries.length);
    for (const { id, components } of entries) {
      w.writeVarU32(id);
      w.writeVarU32(components.length);
      for (const [ty, idx, value] of components) {
        w.writeVarU32(idx);
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
    w.writeVarU32(this.#tickNumber);
    w.writeVarU32(this.#serverTimeMs >>> 0);
    const headerEnd = w.offset;

    const visible = this.#visibleSet(slot);

    // Entities the client knew but no longer sees / no longer exist.
    for (const id of slot.knownEntities) {
      if (!visible.has(id) || !this.world.exists(id)) {
        w.writeU8(DeltaOp.EntityDestroyed);
        w.writeVarU32(id);
        slot.knownEntities.delete(id);
        slot.knownComponents.delete(id);
      }
    }

    // Visible entities — adds, updates, removes.
    for (const id of visible) {
      if (!this.world.exists(id)) continue;
      const isNew = !slot.knownEntities.has(id);
      if (isNew) {
        w.writeU8(DeltaOp.EntityCreated);
        w.writeVarU32(id);
        slot.knownEntities.add(id);
        slot.knownComponents.set(id, new Set());
      }
      const known = slot.knownComponents.get(id) ?? new Set<RiftType>();
      slot.knownComponents.set(id, known);
      const currentComps = new Set<RiftType>();
      for (const ty of this.schema.components) {
        const idx = this.schema.componentIndexOf(ty);
        if (idx === undefined) continue;
        const pool = this.world.pool(ty);
        const value = pool.values.get(id);
        if (value === undefined) continue;
        currentComps.add(ty);
        if (!known.has(ty)) {
          w.writeU8(DeltaOp.ComponentAdded);
          w.writeVarU32(id);
          w.writeVarU32(idx);
          ty.encode(w, value);
          known.add(ty);
        } else if (pool.dirty.has(id) || isNew) {
          w.writeU8(DeltaOp.ComponentUpdated);
          w.writeVarU32(id);
          w.writeVarU32(idx);
          ty.encode(w, value);
        }
      }
      for (const ty of known) {
        if (!currentComps.has(ty)) {
          const idx = this.schema.componentIndexOf(ty);
          if (idx !== undefined) {
            w.writeU8(DeltaOp.ComponentRemoved);
            w.writeVarU32(id);
            w.writeVarU32(idx);
          }
          known.delete(ty);
        }
      }
    }

    if (w.offset === headerEnd) {
      // No ops written — nothing to send.
      return;
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
