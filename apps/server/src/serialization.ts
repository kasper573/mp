import type { AbstractTransformer } from "@mp/transformer";
import { jsonTransformer, type ConcreteTransformer } from "@mp/transformer";
import { Vector } from "@mp/excalibur";
import type { SocketIO_DTO } from "@mp/network/server";
import type { ClientStateUpdate } from "./context";

jsonTransformer.registerClass(Vector, { identifier: "vector" });

export const serialization = {
  stateUpdate: jsonTransformer as unknown as ConcreteTransformer<
    ClientStateUpdate,
    SocketIO_DTO
  >,
  rpc: jsonTransformer as unknown as AbstractTransformer<SocketIO_DTO>,
};
