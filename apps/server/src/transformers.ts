import type {
  DeserializationResult,
  Serialized,
  Transformer,
} from "@mp/tse/server";
import SuperJSON from "superjson";
import { Vector } from "@mp/excalibur";
import type { ClientState } from "./context";

SuperJSON.registerClass(Vector, { identifier: "vector" });

const jsonTransformer: Transformer = {
  deserialize: (str) => {
    try {
      return { ok: true, value: SuperJSON.parse(str as string) };
    } catch (error) {
      return { ok: false, error };
    }
  },
  serialize: (state) => {
    return SuperJSON.stringify(state) as Serialized<ClientState>;
  },
};

const clientState: Transformer<ClientState> = {
  deserialize: (serialized) => {
    return jsonTransformer.deserialize(
      serialized,
    ) as DeserializationResult<ClientState>;
  },
  serialize: (state) =>
    jsonTransformer.serialize(state) as Serialized<ClientState>,
};

export const transformers = {
  clientState,
  message: jsonTransformer,
};
