import SuperJSON from "superjson";
import { Vector } from "@mp/excalibur";
import type { Parser, Serializer } from "@mp/network/server";
import type { ClientStateUpdate } from "./context";

SuperJSON.registerClass(Vector, { identifier: "vector" });

const json = {
  parse: SuperJSON.parse as Parser,
  serialize: SuperJSON.stringify as Serializer,
};

export const serialization = {
  stateUpdate: json as Transformer<ClientStateUpdate>,
  message: json,
};

interface Transformer<T> {
  parse: Parser<T>;
  serialize: Serializer<T>;
}
