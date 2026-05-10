import type { Reader } from "./reader";
import type { Writer } from "./writer";

export enum RiftTypeKind {
  U8 = 1,
  U16 = 2,
  U32 = 3,
  U64 = 4,
  I8 = 5,
  I16 = 6,
  I32 = 7,
  I64 = 8,
  F32 = 9,
  F64 = 10,
  Bool = 11,
  String = 12,
  Bytes = 13,
  EnumOf = 14,
  Bitflags = 15,
  Object = 16,
  Array = 17,
  Tuple = 18,
  Optional = 19,
  Union = 20,
  Transform = 21,
}

export interface RiftType<T = unknown> {
  readonly kind: RiftTypeKind;
  inspect(): Uint8Array;
  encode(w: Writer, value: T): void;
  decode(r: Reader): T;
  readonly __t?: T;
}

export type InferValue<R> = R extends RiftType<infer T> ? T : never;
