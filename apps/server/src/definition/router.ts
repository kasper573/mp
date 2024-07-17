import { createExampleRouter } from "../modules/example";
import { t } from "./tsock";

export type ServerRouter = ReturnType<typeof createRouter>;

export function createRouter() {
  return t.router({
    example: createExampleRouter(),
  });
}
