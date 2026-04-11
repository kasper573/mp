import type { ComponentChildren, VNode } from "preact";
import { h, render } from "preact";
import { signal, type Signal } from "@mp/state";
import type { EntityId } from "@rift/core";
import { defineModule } from "@rift/modular";
import { ChatMessage } from "../../events";
import {
  PreactRendererContext,
  type ChatLine,
  type PreactRendererContextValue,
} from "./context";
import { Hud } from "./hud";

export interface PreactRendererApi {
  mount(target?: HTMLElement, children?: ComponentChildren): void;
  unmount(): void;
  setLocalCharacterEntityId(id: EntityId | undefined): void;
  setRespawnHandler(fn: (() => void) | undefined): void;
  readonly localCharacterEntityId: Signal<EntityId | undefined>;
}

const MAX_CHAT_LINES = 50;

export const PreactRendererModule = defineModule({
  client: (ctx): { api: PreactRendererApi; dispose: () => void } => {
    const localCharacterEntityId = signal<EntityId | undefined>(undefined);
    const respawn = signal<(() => void) | undefined>(undefined);
    const chatLines = signal<ChatLine[]>([]);

    const unsubscribeChat = ctx.rift.on(ChatMessage, (msg) => {
      const next = [...chatLines.value, msg];
      if (next.length > MAX_CHAT_LINES) {
        next.splice(0, next.length - MAX_CHAT_LINES);
      }
      chatLines.value = next;
    });

    const value: PreactRendererContextValue = {
      rift: ctx.rift,
      localCharacterEntityId,
      respawn,
      chatLines,
    };

    let mountTarget: HTMLElement | undefined;

    const mount: PreactRendererApi["mount"] = (target, children) => {
      if (mountTarget) {
        throw new Error("PreactRenderer is already mounted");
      }
      const node = target ?? ctx.root;
      mountTarget = node;
      const tree: VNode = h(
        PreactRendererContext.Provider,
        { value },
        h(Hud, null, children),
      );
      render(tree, node);
    };

    const unmount: PreactRendererApi["unmount"] = () => {
      if (mountTarget) {
        render(null, mountTarget);
        mountTarget = undefined;
      }
    };

    const dispose = () => {
      unmount();
      unsubscribeChat();
    };

    return {
      api: {
        mount,
        unmount,
        setLocalCharacterEntityId: (id) => {
          localCharacterEntityId.value = id;
        },
        setRespawnHandler: (fn) => {
          respawn.value = fn;
        },
        get localCharacterEntityId() {
          return localCharacterEntityId;
        },
      },
      dispose,
    };
  },
});
