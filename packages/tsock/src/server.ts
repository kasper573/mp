import type {
  CreateContextOptions,
  RouterDefinition,
  Unsubscribe,
} from "./shared";
import { Initializer } from "./shared";

export { CreateContextOptions };

export function createServer<Context, Router extends RouterDefinition<Context>>(
  options: CreateServerOptions<Context, Router>,
): Server {
  return {} as Server;
}

export interface Server {
  listen(port: number): Unsubscribe;
}

export interface CreateServerOptions<
  Context,
  Router extends RouterDefinition<Context>,
> {
  router: Router;
  createContext: (options: CreateContextOptions<Context>) => Context;
}

export const init = new Initializer();
