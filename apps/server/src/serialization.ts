import type { AbstractTransformer } from "@mp/transformer";
import { cborTransformer, type ConcreteTransformer } from "@mp/transformer";
import type { SocketIO_DTO } from "@mp/network/server";
import { Vector } from "@mp/math";
import type { ClientStateUpdate } from "./context";

cborTransformer.registerTag(9001, Vector, {
  encode: ({ x, y }) => [x, y],
  decode: ([x, y]) => new Vector(x, y),
});

cborTransformer.registerTag(9002, Map, {
  encode: (map) => [...map.entries()],
  decode: (entries) => new Map(entries),
});

export const serialization = {
  stateUpdate: cborTransformer as unknown as ConcreteTransformer<
    ClientStateUpdate,
    SocketIO_DTO
  >,
  rpc: cborTransformer as unknown as AbstractTransformer<SocketIO_DTO>,
};

export const tokenHeaderName = "token";
