import type { Layer } from "@mp/tiled-loader";
import type { Accessor } from "solid-js";
import { createMemo, For } from "solid-js";
import { ParentContext, Pixi } from "@mp/solid-pixi";
import { type JSX } from "solid-js";
import { recallLayer, LayerViewFactory } from "./layer";
import type { TiledSpritesheetRecord } from "./spritesheet";
import { createTiledTextureLookup } from "./spritesheet";

export interface TileRendererProps {
  layers: Layer[];
  spritesheets: TiledSpritesheetRecord;
  children?: ChildrenByLayerName;
  label?: string;
}

export function TiledRenderer(props: TileRendererProps) {
  const container = createMemo(() => {
    const lookup = createTiledTextureLookup(props.spritesheets);
    const factory = new LayerViewFactory(lookup);
    return factory.createLayerContainer(props.layers);
  });

  return (
    <>
      <Pixi as={container()} label={props.label} />
      <For each={Object.entries(props.children ?? {})}>
        {([name, childrenForLabel]) => {
          const layerView = container().children.find(
            (c) => recallLayer(c).name === name,
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
