import { object } from "@mp/schema";
import type { TypeOf } from "@mp/schema";
import type { LoaderContext } from "../context";
import { data, tileUnit } from "./common";

export type Chunk = TypeOf<ReturnType<typeof chunk>>;

export function chunk(context: LoaderContext) {
  return object({
    data: data(context),
    height: tileUnit,
    width: tileUnit,
    x: tileUnit,
    y: tileUnit,
  });
}
