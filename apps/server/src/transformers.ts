import SuperJSON from "superjson";
import { Vector } from "@mp/excalibur";
import type { Parser, Serializer } from "@mp/network/server";
import type { ClientStateUpdate } from "./context";

SuperJSON.registerClass(Vector, { identifier: "vector" });

const jsonTransformer = {
  parse: SuperJSON.parse as Parser,
  serialize: SuperJSON.stringify as Serializer,
};

export const transformers = {
  stateUpdate: jsonTransformer as Transformer<ClientStateUpdate>,
  message: jsonTransformer,
};

interface Transformer<T> {
  parse: Parser<T>;
  serialize: Serializer<T>;
}
