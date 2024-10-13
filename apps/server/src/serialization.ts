import type { AbstractTransformer } from "@mp/transformer";
import { cborTransformer, type ConcreteTransformer } from "@mp/transformer";
import type { SocketIO_DTO } from "@mp/network/server";
import { Vector } from "@mp/math";
import type { ClientStateUpdate } from "./context";

const vectorTag = 9001;
cborTransformer.registerEncoder(Vector, ({ x, y }) => [vectorTag, [x, y]]);
cborTransformer.registerDecoder(vectorTag, (tag) => {
  const [x, y] = tag.contents as [number, number];
  return new Vector(x, y);
});

const mapTag = 9002;
cborTransformer.registerEncoder(Map, (map) => {
  return [mapTag, [...map.entries()]];
});
cborTransformer.registerDecoder(mapTag, (tag) => {
  return new Map(tag.contents as Array<[unknown, unknown]>);
});

export const serialization = {
  stateUpdate: cborTransformer as unknown as ConcreteTransformer<
    ClientStateUpdate,
    SocketIO_DTO
  >,
  rpc: cborTransformer as unknown as AbstractTransformer<SocketIO_DTO>,
};

export const tokenHeaderName = "token";
