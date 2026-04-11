import type { ComponentChildren } from "preact";
import { h, render } from "preact";
import { signal, type Signal } from "@mp/state";
import type { EntityId } from "@rift/core";
import { defineModule } from "@rift/modular";
import { RespawnIntent } from "../../events";
import {
  PreactRendererContext,
  type PreactRendererContextValue,
} from "./context";
import { Hud } from "./hud";

export interface PreactRendererApi {
  mount(target?: HTMLElement, children?: ComponentChildren): void;
  unmount(): void;
  setLocalCharacterEntityId(id: EntityId | undefined): void;
  readonly localCharacterEntityId: Signal<EntityId | undefined>;
}

export const PreactRendererModule = defineModule({
  client: (ctx): { api: PreactRendererApi; dispose: () => void } => {
    const localCharacterEntityId = signal<EntityId | undefined>(undefined);
    const respawn = signal<(() => void) | undefined>(() =>
      ctx.send(RespawnIntent, {}),
    );

    const value: PreactRendererContextValue = {
      rift: ctx.rift,
      localCharacterEntityId,
      respawn,
    };

    let mountTarget: HTMLElement | undefined;

    const mount: PreactRendererApi["mount"] = (target, children) => {
      if (mountTarget) {
        throw new Error("PreactRenderer is already mounted");
      }
      const node = target ?? ctx.root;
      mountTarget = node;
      render(
        h(PreactRendererContext.Provider, { value }, h(Hud, null, children)),
        node,
      );
    };

    const unmount: PreactRendererApi["unmount"] = () => {
      if (mountTarget) {
        render(null, mountTarget);
        mountTarget = undefined;
      }
    };

    const dispose = () => {
      unmount();
    };

    return {
      api: {
        mount,
        unmount,
        setLocalCharacterEntityId: (id) => {
          localCharacterEntityId.value = id;
        },
        get localCharacterEntityId() {
          return localCharacterEntityId;
        },
      },
      dispose,
    };
  },
});
