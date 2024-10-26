import type { SocketIO_DTO } from "@mp/network/server";
import type { AbstractTransformer } from "@mp/transformer";
import { jsonTransformer } from "@mp/transformer";

export const rpcSerializer =
  jsonTransformer as unknown as AbstractTransformer<SocketIO_DTO>;
