import type { Layer } from "@mp/tiled-loader";
import { createEffect, createMemo, type ParentProps } from "solid-js";
import { Pixi } from "@mp/pixi/solid";
import { getLayerType, LayerViewFactory } from "./layer";
import type { TiledSpritesheetRecord } from "./spritesheet";
import { createTextureLookup } from "./spritesheet";

export interface TileRendererProps extends ParentProps {
  layers: Layer[];
  spritesheets: TiledSpritesheetRecord;
  debug?: boolean;
}

export function TiledRenderer(props: TileRendererProps) {
  const container = createMemo(() => {
    const lookup = createTextureLookup(props.spritesheets);
    const factory = new LayerViewFactory(lookup);
    return factory.createLayerContainer(props.layers);
  });

  createEffect(() => {
    const objects = container().children.filter(
      (c) => getLayerType(c) === "objectgroup",
    );

    for (const obj of objects) {
      obj.visible = props.debug ?? true;
    }
  });

  return <Pixi as={container()}>{props.children}</Pixi>;
}
