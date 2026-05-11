import { batch, signal, type ReadonlySignal } from "@preact/signals-core";
import type { ClientId, EntityId } from "./protocol";
import type { RiftEvent, UnsubscribeFn } from "@rift/event";
import { EventBus } from "@rift/event";
import { isObjectType, Reader, Writer } from "@rift/types";
import type { ClientTransport, ClientTransportEvent } from "./transport";
import { DeltaApplied, DeltaOp, Opcode, ClientDisconnected } from "./protocol";
import type { World } from "./world";
import { RiftCloseCode } from "./transport";

export type ClientConnectionState =
  | "idle"
  | "connecting"
  | "handshaking"
  | "open"
  | "closed";

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
  readonly #stateSignal = signal<ClientConnectionState>("idle");
  readonly #serverTickSignal = signal(0);
  readonly #serverTimeSignal = signal(0);

  #clientId?: ClientId;
  #unsub?: () => void;
  #connectResolve?: () => void;
  #connectReject?: (e: Error) => void;

  constructor(
    public readonly world: W,
    private readonly transport: ClientTransport,
  ) {
    super();
    this.#hash = world.schema.digest();
  }

  get state(): ReadonlySignal<ClientConnectionState> {
    return this.#stateSignal;
  }

  get serverTick(): ReadonlySignal<number> {
    return this.#serverTickSignal;
  }

  get serverTime(): ReadonlySignal<number> {
    return this.#serverTimeSignal;
  }

  get clientId(): ClientId | undefined {
    return this.#clientId;
  }

  #unsubscribeFromEmit?: UnsubscribeFn;
  connect(): Promise<void> {
    const current = this.#stateSignal.peek();
    if (
      current === "open" ||
      current === "connecting" ||
      current === "handshaking"
    ) {
      return Promise.resolve();
    }
    this.#unsubscribeFromEmit = this.onAny(this.#onEmit);
    this.#stateSignal.value = "connecting";
    return new Promise<void>((resolve, reject) => {
      this.#connectResolve = resolve;
      this.#connectReject = reject;
      this.#unsub = this.transport.on((ev) => this.#onTransportEvent(ev));
      if (this.transport.state === "open") {
        this.#onTransportEvent({ type: "open" });
      }
    });
  }

  disconnect(
    code = RiftCloseCode.Normal,
    reason = "client disconnect",
  ): Promise<void> {
    this.#unsubscribeFromEmit?.();
    this.transport.close(code, reason);
    this.#unsub?.();
    this.#unsub = undefined;
    this.#stateSignal.value = "closed";
    return Promise.resolve();
  }

  #onEmit = (event: RiftClientEvent): boolean => {
    switch (event.target) {
      case "local":
        return true;
      case "wire": {
        if (this.#stateSignal.peek() !== "open") {
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
    if (serverHash.byteLength !== this.#hash.byteLength) {
      this.#rejectHandshake("schema mismatch");
      return;
    }
    for (let i = 0; i < this.#hash.byteLength; i++) {
      if (serverHash[i] !== this.#hash[i]) {
        this.#rejectHandshake("schema mismatch");
        return;
      }
    }
    this.#clientId = id;
    // Without batching, an effect watching the world fires mid-snapshot
    // while state is still "handshaking", and any wire emit it triggers
    // is silently dropped by `#onEmit`.
    batch(() => {
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
      this.#serverTickSignal.value = tick;
      this.#serverTimeSignal.value = timeMs;
      this.#stateSignal.value = "open";
    });
    this.#connectResolve?.();
    this.#connectResolve = undefined;
    this.#connectReject = undefined;
    this.emit({
      type: DeltaApplied,
      data: { tick, timeMs },
      source: "local",
      target: "local",
    });
  }

  #rejectHandshake(reason: string): void {
    this.transport.close(RiftCloseCode.SchemaMismatch, reason);
    this.#connectReject?.(new Error(reason));
    this.#connectReject = undefined;
    this.#connectResolve = undefined;
  }

  #applyDelta(data: Uint8Array): void {
    const r = new Reader(data, 1);
    const tick = r.readVarU32();
    const timeMs = r.readVarU32();
    const components = this.world.schema.components;
    // Batch for the same reason as #applyAccept: consumers see one
    // post-delta world, not a half-applied stream.
    batch(() => {
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
      this.#serverTickSignal.value = tick;
      this.#serverTimeSignal.value = timeMs;
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
        this.#stateSignal.value = "handshaking";
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
        const prev = this.#stateSignal.peek();
        const wasConnecting = prev === "connecting" || prev === "handshaking";
        this.#stateSignal.value = "closed";
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
          this.#connectReject?.(
            new Error(`closed before handshake: ${ev.reason}`),
          );
          this.#connectReject = undefined;
          this.#connectResolve = undefined;
        }
        return;
      }
      case "error": {
        if (this.#connectReject) {
          this.#connectReject(ev.error);
          this.#connectReject = undefined;
          this.#connectResolve = undefined;
        }
        return;
      }
    }
  }
}
