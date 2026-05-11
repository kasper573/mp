import type { ClientId, EntityId } from "./protocol";
import { RiftCloseCode } from "./transport";
import { EventBus } from "./event";
import type { RiftEvent, UnsubscribeFn } from "./event";
import { isObjectType, Reader, Writer } from "@rift/types";
import type { RiftType } from "@rift/types";
import { WHOLE_DIRTY } from "./world";
import type { Pool } from "./world";
import { hashEquals, type RiftSchema } from "./schema";
import type { ServerTransportEvent, ServerTransport } from "./transport";
import {
  DeltaOp,
  Opcode,
  ClientConnected,
  ClientDisconnected,
  Tick,
} from "./protocol";
import { World } from "./world";

interface ComponentEntry {
  readonly ty: RiftType;
  readonly idx: number;
  readonly pool: Pool<unknown>;
}

export type VisibilityFn = (
  clientId: ClientId,
) => ReadonlySet<EntityId> | undefined;

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
  // Pooled writer reused across ticks. Sized large enough to avoid
  // #reserve doubling for typical delta packets.
  readonly writer: Writer;
}

export type RiftServerEvent<Data = unknown> = RiftEvent<
  Data,
  RiftServerEventSource,
  RiftServerEventTarget
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
  readonly #scratchWriter = new Writer(512);
  // Schema is fixed for the lifetime of the server, so resolve each component
  // type to its (index, pool) once and reuse — the per-tick hot loops in
  // #composeSharedUpdates / #flushClient / #buildSnapshotFor would otherwise
  // re-resolve both for every (entity, component) pair.
  readonly #componentEntries: ReadonlyArray<ComponentEntry>;
  readonly #componentEntryByType: ReadonlyMap<RiftType, ComponentEntry>;
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
    this.#componentEntries = opts.schema.components.map((ty, idx) => ({
      ty,
      idx,
      pool: this.world.pool(ty),
    }));
    this.#componentEntryByType = new Map(
      this.#componentEntries.map((e) => [e.ty, e]),
    );
  }

  setVisibility(fn: VisibilityFn | undefined): void {
    this.#visibility = fn;
  }

  #unsubscribeFromTransport?: () => void;
  #unsubscribeFromEmit?: UnsubscribeFn;
  start(): Promise<void> {
    if (this.#started) {
      return Promise.resolve();
    }
    this.#unsubscribeFromEmit = this.onAny(this.#onEmit);
    this.#started = true;
    this.#unsubscribeFromTransport = this.#transport.on((ev) =>
      this.#onTransportEvent(ev),
    );
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
    this.#unsubscribeFromEmit = undefined;
    this.#unsubscribeFromTransport?.();
    this.#unsubscribeFromTransport = undefined;
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
    const now = performance.now();
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

    const sharedUpdates = this.#composeSharedUpdates();

    for (const slot of this.#clients.values()) {
      this.#flushClient(slot, sharedUpdates);
    }

    this.world.clearChanges();
  }

  // Encode each dirty (entity, component) ComponentUpdated payload once
  // into shared bytes. #flushClient then memcpys these into each recipient's
  // writer instead of re-encoding per client. With N clients all seeing the
  // same M entities, this drops the per-tick encode cost from N*M to M.
  //
  // Keyed per-(entity, component) — not per-entity — so #flushClient can
  // skip components that this particular client doesn't yet know (those
  // get a per-client ComponentAdded with full encode instead).
  #composeSharedUpdates(): Map<EntityId, Map<RiftType, Uint8Array>> {
    const out = new Map<EntityId, Map<RiftType, Uint8Array>>();
    const scratch = this.#scratchWriter;
    for (const { ty, idx, pool } of this.#componentEntries) {
      if (pool.dirty.size === 0) {
        continue;
      }
      for (const [id, mask] of pool.dirty) {
        const value = pool.values.get(id);
        if (value === undefined) {
          continue;
        }
        scratch.reset();
        this.#writeComponentUpdated(scratch, id, idx, ty, value, mask);
        let perEntity = out.get(id);
        if (perEntity === undefined) {
          perEntity = new Map();
          out.set(id, perEntity);
        }
        perEntity.set(ty, scratch.finish());
      }
    }
    return out;
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

  #visibleSet(slot: ClientSlot): ReadonlySet<EntityId> {
    if (this.#visibility === undefined) {
      return this.world.entities();
    }
    return this.#visibility(slot.id) ?? this.world.entities();
  }

  #clientSeesEntity(slot: ClientSlot, entityId: EntityId): boolean {
    if (this.#visibility === undefined) {
      return this.world.exists(entityId);
    }
    const result = this.#visibility(slot.id);
    if (result === undefined) {
      return this.world.exists(entityId);
    }
    return result.has(entityId);
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
      if (!this.world.exists(id)) {
        continue;
      }
      const comps: Array<[RiftType, number, unknown]> = [];
      // #componentEntries is already in schema (index) order, so no sort needed.
      for (const { ty, idx, pool } of this.#componentEntries) {
        const value = pool.values.get(id);
        if (value === undefined) {
          continue;
        }
        comps.push([ty, idx, value]);
      }
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

  #flushClient(
    slot: ClientSlot,
    sharedUpdates: Map<EntityId, Map<RiftType, Uint8Array>>,
  ): void {
    if (!slot.handshakeCompleted) {
      return;
    }
    const w = slot.writer;
    w.reset();
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
      if (!this.world.exists(id)) {
        continue;
      }
      let known = slot.knownComponents.get(id);
      if (known === undefined) {
        w.writeU8(DeltaOp.EntityCreated);
        w.writeVarU32(id);
        slot.knownEntities.add(id);
        known = new Set();
        slot.knownComponents.set(id, known);
      }
      const present = this.world.componentsOf(id);
      const sharedForEntity = sharedUpdates.get(id);
      for (const ty of present) {
        const entry = this.#componentEntryByType.get(ty);
        if (entry === undefined) {
          continue;
        }
        if (!known.has(ty)) {
          const value = entry.pool.values.get(id);
          if (value === undefined) {
            continue;
          }
          w.writeU8(DeltaOp.ComponentAdded);
          w.writeVarU32(id);
          w.writeVarU32(entry.idx);
          ty.encode(w, value);
          known.add(ty);
          continue;
        }
        const sharedBytes = sharedForEntity?.get(ty);
        if (sharedBytes !== undefined) {
          w.writeBytesRaw(sharedBytes);
        }
      }
      for (const ty of known) {
        if (present.has(ty)) {
          continue;
        }
        const entry = this.#componentEntryByType.get(ty);
        if (entry !== undefined) {
          w.writeU8(DeltaOp.ComponentRemoved);
          w.writeVarU32(id);
          w.writeVarU32(entry.idx);
        }
        known.delete(ty);
      }
    }

    if (w.offset === headerEnd) {
      // No ops written — nothing to send.
      return;
    }
    this.#transport.send(slot.id, w.finish());
  }

  #writeComponentUpdated(
    w: Writer,
    id: EntityId,
    idx: number,
    ty: RiftType,
    value: unknown,
    mask: number | undefined,
  ): void {
    w.writeU8(DeltaOp.ComponentUpdated);
    w.writeVarU32(id);
    w.writeVarU32(idx);
    if (isObjectType(ty)) {
      ty.encodePartial(
        w,
        value as Record<string, unknown>,
        mask ?? WHOLE_DIRTY,
      );
    } else {
      ty.encode(w, value);
    }
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
    if (!hashEquals(clientHash, this.#hash)) {
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
          writer: new Writer(4096),
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
