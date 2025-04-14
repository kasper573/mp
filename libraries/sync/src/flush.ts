import { encodeServerToClientMessage } from "./encoding";
import type { PatchableState } from "./patch-state-machine";
import type { PatchStateMachine } from "./patch-state-machine";

import type { ClientId } from "./shared";

export async function flushPatches<State extends PatchableState>(
  opt: FlushPatchesOptions<State>,
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  for (const [clientId, patch] of opt.state.flush()) {
    const send = opt.getSender(clientId);
    if (send) {
      const result = send(encodeServerToClientMessage(patch));
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
  }

  await Promise.all(promises);
}

export interface FlushPatchesOptions<State extends PatchableState> {
  state: PatchStateMachine<State>;
  getSender: (
    clientId: ClientId,
  ) => ((buffer: Uint8Array<ArrayBufferLike>) => unknown) | undefined;
}
