import { object } from "@mp/schema";
import type { TypeOf } from "@mp/schema";
import { data, tileUnit } from "./common";

export type Chunk = TypeOf<typeof chunk>;

export const chunk = object({
  data,
  height: tileUnit,
  width: tileUnit,
  x: tileUnit,
  y: tileUnit,
});
