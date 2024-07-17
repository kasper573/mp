import { createServer } from "@mp/tsock";
import { createRouter } from "./definition/router";
import { createContext } from "./definition/context";
import { env } from "./env";

const server = createServer({
  router: createRouter(),
  createContext,
});

server.listen(env.port);
