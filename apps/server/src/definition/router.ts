import { createExampleRouter } from "../modules/example";
import { t } from "./trpc";

export type ServerRouter = ReturnType<typeof createTrpcRouter>;

export function createTrpcRouter() {
  return t.router({
    example: createExampleRouter(),
  });
}
