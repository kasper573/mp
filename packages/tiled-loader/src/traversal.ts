import type { Layer } from "./schema/layer";
import type { TiledObject } from "./schema/object";

export function* objectsInLayers(
  layers: Layer[],
  transform = noopTransformer,
): Generator<TiledObject> {
  yield* objectsInLayersImpl(layers, [], transform);
}

function* objectsInLayersImpl(
  layers: Layer[],
  ancestry: Layer[],
  transform: TiledObjectTransformer,
): Generator<TiledObject> {
  for (const layer of layers) {
    switch (layer.type) {
      case "group":
        yield* objectsInLayersImpl(
          layer.layers,
          [...ancestry, layer],
          transform,
        );
        break;
      case "objectgroup":
        for (const obj of layer.objects) {
          yield transform(obj, ancestry);
        }
        break;
    }
  }
}

const noopTransformer: TiledObjectTransformer = (obj) => obj;

export type TiledObjectTransformer = (
  obj: TiledObject,
  ancestry: Layer[],
) => TiledObject;
