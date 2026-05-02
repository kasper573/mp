import { signal, type ReadonlySignal } from "@preact/signals-core";
import type { ClientId, EntityId } from "./protocol";
import type { RiftEvent, UnsubscribeFn } from "@rift/event";
import { EventBus } from "@rift/event";
import type { InferValue, RiftType } from "@rift/types";
import { Reader } from "@rift/types";
import type { RiftSchema } from "./schema";
import type { ClientTransport, ClientTransportEvent } from "./transport";
import { DeltaApplied, DeltaOp, Opcode, ClientDisconnected } from "./protocol";
import { Writer } from "@rift/types";
import { internal } from "./internal";
import type { World } from "./world";
import { createWorld } from "./world";
import {
  type Cleanup,
  inject,
  initializeModules,
  RiftModule,
} from "@rift/module";
import { RiftCloseCode } from "./transport";

export type ClientConnectionState =
  | "idle"
  | "connecting"
  | "handshaking"
  | "open"
  | "closed";

export interface ClientOptions {
  readonly schema: RiftSchema;
  readonly transport: ClientTransport;
  readonly modules?: readonly RiftClientModule[];
}

export type RiftClientEventOrigin = "local" | "wire";
export type RiftClientEvent<Data = unknown> = RiftEvent<
  Data,
  RiftClientEventOrigin,
  RiftClientEventOrigin
>;

export type inferClientEvent<Type extends RiftType> = RiftClientEvent<
  InferValue<Type>
>;

export class RiftClient extends EventBus<
  RiftClientEventOrigin,
  RiftClientEventOrigin
> {
  readonly schema: RiftSchema;
  readonly world: World;

  readonly #transport: ClientTransport;
  readonly #modules: readonly RiftClientModule[];
  readonly #hash: Uint8Array;
  readonly #stateSignal = signal<ClientConnectionState>("idle");
  readonly #serverTickSignal = signal(0);
  readonly #serverTimeSignal = signal(0);

  #clientId?: ClientId;
  #unsub?: () => void;
  #connectResolve?: () => void;
  #connectReject?: (e: Error) => void;
  #moduleCleanup?: Cleanup;

  constructor(opts: ClientOptions) {
    super();
    this.schema = opts.schema;
    this.#transport = opts.transport;
    this.#modules = opts.modules ?? [];
    this.#hash = opts.schema.digest();
    this.world = createWorld(opts.schema);
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
  async connect(): Promise<void> {
    const current = this.#stateSignal.peek();
    if (
      current === "open" ||
      current === "connecting" ||
      current === "handshaking"
    ) {
      return;
    }
    this.#unsubscribeFromEmit = this.onAny(this.#onEmit);
    if (!this.#moduleCleanup) {
      this.#moduleCleanup = await initializeModules([this, ...this.#modules]);
    }
    this.#stateSignal.value = "connecting";
    return new Promise<void>((resolve, reject) => {
      this.#connectResolve = resolve;
      this.#connectReject = reject;
      this.#unsub = this.#transport.on((ev) => this.#onTransportEvent(ev));
      if (this.#transport.state === "open") {
        this.#onTransportEvent({ type: "open" });
      }
    });
  }

  async disconnect(
    code = RiftCloseCode.Normal,
    reason = "client disconnect",
  ): Promise<void> {
    this.#unsubscribeFromEmit?.();
    this.#transport.close(code, reason);
    this.#unsub?.();
    this.#unsub = undefined;
    this.#stateSignal.value = "closed";
    if (this.#moduleCleanup) {
      await this.#moduleCleanup();
      this.#moduleCleanup = undefined;
    }
  }

  #onEmit = (event: RiftClientEvent): boolean => {
    switch (event.target) {
      // Local targeting means simply running the handlers, which is already done by the EventBus emit.
      case "local":
        return true;

      case "wire": {
        if (this.#stateSignal.peek() !== "open") {
          // Can't send if we're not open.
          return false;
        }

        const idx = this.schema.eventIndexOf(event.type);
        if (idx === undefined) {
          // Unknown event type.
          return false;
        }

        // Encode and send
        const w = new Writer(64);
        w.writeU8(Opcode.EventFromClient);
        w.writeU16(idx);
        event.type.encode(w, event.data);
        this.#transport.send(w.finish());
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
    const components = this.schema.components;
    const entityCount = r.readVarU32();
    for (let i = 0; i < entityCount; i++) {
      const entId = r.readVarU32() as EntityId;
      this.world[internal].ingestCreate(entId);
      const compCount = r.readVarU32();
      for (let j = 0; j < compCount; j++) {
        const idx = r.readVarU32();
        const ty = components[idx];
        this.world[internal].ingestAdd(entId, ty, ty.decode(r));
      }
    }
    this.#serverTickSignal.value = tick;
    this.#serverTimeSignal.value = timeMs;
    this.#stateSignal.value = "open";
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
    this.#transport.close(RiftCloseCode.SchemaMismatch, reason);
    this.#connectReject?.(new Error(reason));
    this.#connectReject = undefined;
    this.#connectResolve = undefined;
  }

  #applyDelta(data: Uint8Array): void {
    const r = new Reader(data, 1);
    const tick = r.readVarU32();
    const timeMs = r.readVarU32();
    const components = this.schema.components;
    const opCount = r.readVarU32();
    for (let i = 0; i < opCount; i++) {
      const op = r.readU8() as DeltaOp;
      switch (op) {
        case DeltaOp.EntityCreated: {
          this.world[internal].ingestCreate(r.readVarU32() as EntityId);
          break;
        }
        case DeltaOp.EntityDestroyed: {
          this.world[internal].ingestDestroy(r.readVarU32() as EntityId);
          break;
        }
        case DeltaOp.ComponentAdded: {
          const id = r.readVarU32() as EntityId;
          const ty = components[r.readVarU32()];
          this.world[internal].ingestAdd(id, ty, ty.decode(r));
          break;
        }
        case DeltaOp.ComponentRemoved: {
          const id = r.readVarU32() as EntityId;
          const ty = components[r.readVarU32()];
          this.world[internal].ingestRemove(id, ty);
          break;
        }
        case DeltaOp.ComponentUpdated: {
          const id = r.readVarU32() as EntityId;
          const ty = components[r.readVarU32()];
          this.world[internal].ingestUpdateDirty(id, ty, (signal) => {
            signal.decodeDirty(r);
          });
          break;
        }
      }
    }
    this.#serverTickSignal.value = tick;
    this.#serverTimeSignal.value = timeMs;
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
    const type = this.schema.events[idx];
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
        this.#transport.send(w.finish());
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

export abstract class RiftClientModule extends RiftModule {
  @inject(RiftClient) accessor client!: RiftClient;
}
