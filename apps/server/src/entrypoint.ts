import { createServer } from "@mp/tsock/server";
import { createRouter } from "./definition/router";
import { env } from "./env";

const server = createServer({
  router: createRouter(),
  createContext: (clientContext) => clientContext,
});

server.listen(env.port);
console.log(`Server listening on port ${env.port}`);
