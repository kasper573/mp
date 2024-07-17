import type {
  CreateContextOptions,
  RouterDefinition,
  Unsubscribe,
} from "./shared";
import { Initializer } from "./shared";

export { CreateContextOptions };

export class Server<Context, Router extends RouterDefinition<Context>> {
  constructor(private options: CreateServerOptions<Context, Router>) {}

  listen(port: number): Unsubscribe {
    return () => {};
  }
}

export interface CreateServerOptions<
  Context,
  Router extends RouterDefinition<Context>,
> {
  router: Router;
  createContext: (options: CreateContextOptions<Context>) => Context;
}

export const init = new Initializer();
