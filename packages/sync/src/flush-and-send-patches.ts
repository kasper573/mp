import { encode } from "@mp/encoding";
import type { PatchableState } from "./patch-state-machine";
import type { PatchStateMachine } from "./patch-state-machine";
import type { ClientId } from "./shared";

export async function flushAndSendPatches<State extends PatchableState>(
  state: PatchStateMachine<State>,
  getSenderForClient: (clientId: ClientId) => BufferSender | undefined,
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  for (const [clientId, patch] of state.flush()) {
    const send = getSenderForClient(clientId);
    if (send) {
      const result = send(encode(patch));
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
  }

  await Promise.all(promises);
}

export type BufferSender = (buffer: Uint8Array<ArrayBufferLike>) => unknown;
