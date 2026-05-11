import type { ClientState, ClientId, EntityId } from "./protocol";
import type { RiftEvent } from "./event";
import { EventBus } from "./event";
import { isObjectType, Reader, Writer } from "@rift/types";
import type { ClientTransport, ClientTransportEvent } from "./transport";
import {
  ClientStateChanged,
  DeltaApplied,
  DeltaOp,
  Opcode,
  ClientDisconnected,
} from "./protocol";
import type { World } from "./world";
import { RiftCloseCode } from "./transport";
import { hashEquals } from "./schema";

export type RiftClientEventOrigin = "local" | "wire";
export type RiftClientEvent<Data = unknown> = RiftEvent<
  Data,
  RiftClientEventOrigin,
  RiftClientEventOrigin
>;

export class RiftClient<W extends World = World> extends EventBus<
  RiftClientEventOrigin,
  RiftClientEventOrigin
> {
  readonly #hash: Uint8Array;

  #state: ClientState = "idle";
  #serverTick = 0;
  #serverTime = 0;
  #clientId?: ClientId;
  #unsubFromTransport?: () => void;
  #unsubFromEmit?: () => void;
  #pendingConnect?: PromiseWithResolvers<void>;

  constructor(
    public readonly world: W,
    private readonly transport: ClientTransport,
  ) {
    super();
    this.#hash = world.schema.digest();
  }

  get state(): ClientState {
    return this.#state;
  }

  get serverTick(): number {
    return this.#serverTick;
  }

  get serverTime(): number {
    return this.#serverTime;
  }

  get clientId(): ClientId | undefined {
    return this.#clientId;
  }

  connect(): Promise<void> {
    if (this.#pendingConnect) {
      return this.#pendingConnect.promise;
    }
    if (this.#state === "open") {
      return Promise.resolve();
    }
    const pending: PromiseWithResolvers<void> = Promise.withResolvers();
    this.#pendingConnect = pending;
    this.#unsubFromEmit = this.onAny(this.#onEmit);
    this.#unsubFromTransport = this.transport.on((ev) =>
      this.#onTransportEvent(ev),
    );
    this.#setState("connecting");
    if (this.transport.state === "open") {
      this.#onTransportEvent({ type: "open" });
    }
    return pending.promise;
  }

  disconnect(
    code = RiftCloseCode.Normal,
    reason = "client disconnect",
  ): Promise<void> {
    this.transport.close(code, reason);
    this.#teardown();
    this.#setState("closed");
    return Promise.resolve();
  }

  #setState(next: ClientState): void {
    if (next === this.#state) {
      return;
    }
    this.#state = next;
    this.emit({
      type: ClientStateChanged,
      data: { state: next },
      source: "local",
      target: "local",
    });
  }

  #teardown(): void {
    this.#unsubFromEmit?.();
    this.#unsubFromEmit = undefined;
    this.#unsubFromTransport?.();
    this.#unsubFromTransport = undefined;
  }

  #settleConnect(err?: Error): void {
    const pending = this.#pendingConnect;
    this.#pendingConnect = undefined;
    if (err) {
      pending?.reject(err);
    } else {
      pending?.resolve();
    }
  }

  #onEmit = (event: RiftClientEvent): boolean => {
    switch (event.target) {
      case "local":
        return true;
      case "wire": {
        if (this.#state !== "open") {
          return false;
        }
        const idx = this.world.schema.eventIndexOf(event.type);
        if (idx === undefined) {
          return false;
        }
        const w = new Writer(64);
        w.writeU8(Opcode.EventFromClient);
        w.writeU16(idx);
        event.type.encode(w, event.data);
        this.transport.send(w.finish());
        return true;
      }
    }
  };

  #applyAccept(data: Uint8Array): void {
    const r = new Reader(data, 1);
    const tick = r.readVarU32();
    const timeMs = r.readVarU32();
    const id = r.readVarU32() as ClientId;
    const serverHash = r.readBytes();
    if (!hashEquals(serverHash, this.#hash)) {
      this.#rejectHandshake("schema mismatch");
      return;
    }
    this.#clientId = id;
    // `world.transaction` lets reactive worlds batch their internal signal
    // bumps into a single notification, so subscribers see a fully-applied
    // snapshot and any wire emit they trigger lands AFTER the state flips
    // to "open" (otherwise `#onEmit` would silently drop it).
    this.world.transaction(() => {
      this.world.clear();
      const components = this.world.schema.components;
      const entityCount = r.readVarU32();
      for (let i = 0; i < entityCount; i++) {
        const entId = r.readVarU32() as EntityId;
        this.world.create(entId);
        const compCount = r.readVarU32();
        for (let j = 0; j < compCount; j++) {
          const idx = r.readVarU32();
          const ty = components[idx];
          this.world.add(entId, ty, ty.decode(r));
        }
      }
      this.#serverTick = tick;
      this.#serverTime = timeMs;
      this.#setState("open");
    });
    this.#settleConnect();
    this.emit({
      type: DeltaApplied,
      data: { tick, timeMs },
      source: "local",
      target: "local",
    });
  }

  #rejectHandshake(reason: string): void {
    this.transport.close(RiftCloseCode.SchemaMismatch, reason);
    this.#settleConnect(new Error(reason));
  }

  #applyDelta(data: Uint8Array): void {
    const r = new Reader(data, 1);
    const tick = r.readVarU32();
    const timeMs = r.readVarU32();
    const components = this.world.schema.components;
    this.world.transaction(() => {
      while (r.remaining > 0) {
        const op = r.readU8() as DeltaOp;
        switch (op) {
          case DeltaOp.EntityCreated: {
            this.world.create(r.readVarU32() as EntityId);
            break;
          }
          case DeltaOp.EntityDestroyed: {
            this.world.destroy(r.readVarU32() as EntityId);
            break;
          }
          case DeltaOp.ComponentAdded: {
            const id = r.readVarU32() as EntityId;
            const ty = components[r.readVarU32()];
            this.world.add(id, ty, ty.decode(r));
            break;
          }
          case DeltaOp.ComponentRemoved: {
            const id = r.readVarU32() as EntityId;
            const ty = components[r.readVarU32()];
            this.world.remove(id, ty);
            break;
          }
          case DeltaOp.ComponentUpdated: {
            const id = r.readVarU32() as EntityId;
            const ty = components[r.readVarU32()];
            if (isObjectType(ty)) {
              const current = this.world.get(id, ty) ?? {};
              const merged = ty.decodePartial(r, current);
              this.world.write(id, ty, merged);
            } else {
              const value = ty.decode(r);
              this.world.write(id, ty, value as Partial<unknown>);
            }
            break;
          }
        }
      }
      this.#serverTick = tick;
      this.#serverTime = timeMs;
    });
    this.emit({
      type: DeltaApplied,
      data: { tick, timeMs },
      source: "local",
      target: "local",
    });
  }

  #applyEventToClient(encodedEvent: Uint8Array): void {
    const r = new Reader(encodedEvent, 1);
    const idx = r.readU16();
    const type = this.world.schema.events[idx];
    if (!type) {
      return;
    }
    this.emit({
      type,
      data: type.decode(r),
      source: "wire",
      target: "local",
    });
  }

  #onTransportEvent(ev: ClientTransportEvent): void {
    switch (ev.type) {
      case "open": {
        this.#setState("handshaking");
        const w = new Writer(64);
        w.writeU8(Opcode.Hello);
        w.writeBytes(this.#hash);
        this.transport.send(w.finish());
        return;
      }
      case "message": {
        if (ev.data.byteLength === 0) {
          return;
        }
        const op = ev.data[0] as Opcode;
        if (op === Opcode.Accept) {
          this.#applyAccept(ev.data);
        } else if (op === Opcode.Delta) {
          this.#applyDelta(ev.data);
        } else if (op === Opcode.EventToClient) {
          this.#applyEventToClient(ev.data);
        }
        return;
      }
      case "close": {
        const wasConnecting =
          this.#state === "connecting" || this.#state === "handshaking";
        this.#setState("closed");
        if (this.#clientId !== undefined) {
          this.emit({
            type: ClientDisconnected,
            data: {
              clientId: this.#clientId,
              code: ev.code,
              reason: ev.reason,
            },
            source: "local",
            target: "local",
          });
        }
        if (wasConnecting) {
          this.#settleConnect(
            new Error(`closed before handshake: ${ev.reason}`),
          );
        }
        this.#teardown();
        return;
      }
      case "error": {
        this.#settleConnect(ev.error);
        return;
      }
    }
  }
}
