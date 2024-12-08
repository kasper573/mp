import type { Layer } from "@mp/tiled-loader";
import type { Accessor } from "solid-js";
import { createEffect, createMemo, For } from "solid-js";
import { ParentContext, Pixi } from "@mp/solid-pixi";
import type { JSX } from "solid-js";
import { recallLayer, LayerViewFactory } from "./layer.tsx";
import type { TiledSpritesheetRecord } from "./spritesheet.ts";
import { createTextureLookup } from "./spritesheet.ts";

export interface TileRendererProps {
  layers: Layer[];
  spritesheets: TiledSpritesheetRecord;
  debug?: boolean;
  children?: ChildrenByLayerName;
  label?: string;
}

export function TiledRenderer(props: TileRendererProps) {
  const container = createMemo(() => {
    const lookup = createTextureLookup(props.spritesheets);
    const factory = new LayerViewFactory(lookup);
    return factory.createLayerContainer(props.layers);
  });

  createEffect(() => {
    const objects = container().children.filter(
      (c) => recallLayer(c).type === "objectgroup"
    );

    for (const obj of objects) {
      obj.visible = props.debug ?? true;
    }
  });

  return (
    <>
      <Pixi as={container()} label={props.label} />
      <For each={Object.entries(props.children ?? {})}>
        {([name, childrenForLabel]) => {
          const layerView = container().children.find(
            (c) => recallLayer(c).name === name
          );
          if (!layerView) {
            throw new Error(`Layer by name "${name}" not found.`);
          }
          return (
            <ParentContext.Provider value={layerView}>
              {childrenForLabel()}
            </ParentContext.Provider>
          );
        }}
      </For>
    </>
  );
}

export type ChildrenByLayerName = {
  [layerName: string]: Accessor<JSX.Element>;
};
