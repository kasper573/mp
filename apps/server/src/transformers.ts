import SuperJSON from "superjson";
import { Vector } from "@mp/excalibur";
import type { Parser, Serializer } from "@mp/network/server";
import type { ClientState } from "./context";

SuperJSON.registerClass(Vector, { identifier: "vector" });

const jsonTransformer = {
  parse: SuperJSON.parse as Parser,
  serialize: SuperJSON.stringify as Serializer,
};

const clientState = jsonTransformer as Transformer<ClientState>;

export const transformers = {
  clientState,
  message: jsonTransformer,
};

interface Transformer<T> {
  parse: Parser<T>;
  serialize: Serializer<T>;
}
